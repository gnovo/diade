import { ApiError } from '@diade/api-client';
import type { CalendarConnectionResponse } from '@diade/contracts';
import { sizes, space as spacing } from '@diade/design-tokens';
import type { ExternalCalendar, ExternalVisibility } from '@diade/domain';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { connectGoogleCalendar } from '../calendar/connect';
import { Button, Card, EmptyState, SectionLabel, Segmented } from '../components/ui';
import { Icon, useColor } from '../design';
import { useSync } from '../sync/SyncProvider';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; offline: boolean }
  | { kind: 'ready'; connection: CalendarConnectionResponse };

type Draft = Record<string, { syncEnabled: boolean; visibility: ExternalVisibility }>;

const FIRST_SYNC_POLL_MS = 2_500;
const FIRST_SYNC_POLL_TRIES = 8;

const isNeedsReauth = (err: unknown) =>
  err instanceof ApiError && err.code === 'CALENDAR_NEEDS_REAUTH';

/**
 * Connect Google Calendar, pick which calendars to bring in and who sees them.
 *
 * First run: nothing syncs and nothing is shared until the member confirms the picker. The
 * defaults on the picker (follow Google's "selected" flag, shared with the partner) are what
 * "shared by default" means, and they are shown before anything leaves Google.
 */
export const CalendarSettingsScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const { syncNow } = useSync();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState<null | 'connect' | 'start' | 'sync' | 'refresh' | 'disconnect'>(
    null,
  );
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const adopt = useCallback((connection: CalendarConnectionResponse) => {
    if (!mounted.current) return;
    setPhase({ kind: 'ready', connection });
    // The picker starts from the server's defaults for calendars not yet confirmed.
    setDraft((current) => {
      const next: Draft = {};
      for (const c of connection.calendars) {
        next[c.id] = current[c.id] ?? { syncEnabled: c.syncEnabled, visibility: c.visibility };
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      let connection = await apiClient.getCalendarConnection();
      // Connected but the list was never fetched (or Google added calendars): ask Google.
      if (connection.connected && !connection.needsReauth && connection.calendars.length === 0) {
        connection = await apiClient.refreshCalendarList();
      }
      adopt(connection);
    } catch (err) {
      if (isNeedsReauth(err)) {
        adopt({ connected: false, needsReauth: true, confirmed: false, calendars: [] });
        return;
      }
      if (mounted.current) setPhase({ kind: 'error', offline: !(err instanceof ApiError) });
    }
  }, [adopt]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const connect = async () => {
    try {
      setBusy('connect');
      const result = await connectGoogleCalendar();
      if (!result.ok) {
        if (result.message) Alert.alert(t('googleCalendar.connectFailed'), result.message);
        else Alert.alert(t('googleCalendar.connectCancelled'));
        return;
      }
      adopt(await apiClient.refreshCalendarList());
    } catch (err) {
      Alert.alert(
        t('googleCalendar.connectFailed'),
        err instanceof Error && err.message ? err.message : t('common.checkConnection'),
      );
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  /** The first sync runs on the server after confirming; wait for it, then pull the result. */
  const waitForFirstSync = async () => {
    for (let i = 0; i < FIRST_SYNC_POLL_TRIES; i++) {
      await new Promise((resolve) => setTimeout(resolve, FIRST_SYNC_POLL_MS));
      try {
        const connection = await apiClient.getCalendarConnection();
        adopt(connection);
        const pending = connection.calendars.some(
          (c) => c.syncEnabled && !c.lastSyncedAt && !c.lastError,
        );
        if (!pending) break;
      } catch {
        break;
      }
    }
    await syncNow();
  };

  const startSyncing = async () => {
    if (phase.kind !== 'ready') return;
    try {
      setBusy('start');
      await apiClient.confirmCalendars({
        calendars: phase.connection.calendars.map((c) => ({
          id: c.id,
          syncEnabled: draft[c.id]?.syncEnabled ?? c.syncEnabled,
          visibility: draft[c.id]?.visibility ?? c.visibility,
        })),
      });
      adopt(await apiClient.getCalendarConnection());
      await waitForFirstSync();
    } catch (err) {
      Alert.alert(
        t('googleCalendar.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const changeCalendar = async (
    calendar: ExternalCalendar,
    changes: { syncEnabled?: boolean; visibility?: ExternalVisibility },
  ) => {
    if (phase.kind !== 'ready') return;
    const previous = draft[calendar.id];
    setDraft((d) => ({ ...d, [calendar.id]: { ...(d[calendar.id] ?? previous!), ...changes } }));

    // Before confirmation the picker only collects choices; nothing is saved until "Start syncing".
    if (!phase.connection.confirmed) return;
    try {
      const result = await apiClient.updateCalendar(calendar.id, changes);
      if (mounted.current) {
        setPhase({
          kind: 'ready',
          connection: { ...phase.connection, calendars: result.calendars },
        });
      }
      // The partner and this device pick the change up on the next pull.
      syncNow();
    } catch (err) {
      setDraft((d) => ({ ...d, [calendar.id]: previous! }));
      Alert.alert(
        t('googleCalendar.couldNotSave'),
        err instanceof ApiError ? err.message : t('googleCalendar.needsConnection'),
      );
    }
  };

  /** Re-reads the calendar list from Google, e.g. after a calendar was shared with the member. */
  const refreshList = async () => {
    try {
      setBusy('refresh');
      adopt(await apiClient.refreshCalendarList());
    } catch (err) {
      if (isNeedsReauth(err)) await load();
      else
        Alert.alert(
          t('googleCalendar.refreshFailed'),
          err instanceof Error ? err.message : t('common.tryAgain'),
        );
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const syncAll = async () => {
    try {
      setBusy('sync');
      await apiClient.syncCalendars();
      adopt(await apiClient.getCalendarConnection());
      await syncNow();
    } catch (err) {
      if (isNeedsReauth(err)) await load();
      else
        Alert.alert(
          t('googleCalendar.couldNotSave'),
          err instanceof Error ? err.message : t('common.tryAgain'),
        );
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const confirmDisconnect = () =>
    Alert.alert(t('googleCalendar.disconnectTitle'), t('googleCalendar.disconnectBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('googleCalendar.disconnect'),
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy('disconnect');
            await apiClient.disconnectCalendar();
            setDraft({});
            await load();
            await syncNow();
          } catch (err) {
            Alert.alert(
              t('googleCalendar.couldNotSave'),
              err instanceof Error ? err.message : t('common.tryAgain'),
            );
          } finally {
            if (mounted.current) setBusy(null);
          }
        },
      },
    ]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Text className="text-title-1 font-bold text-ink">{t('googleCalendar.title')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('googleCalendar.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center"
          >
            <Icon name="x" size={sizes['icon-md']} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing[4],
            paddingTop: spacing[4],
            paddingBottom: spacing[8],
          }}
        >
          {phase.kind === 'loading' ? (
            <View className="py-10 items-center">
              <ActivityIndicator />
            </View>
          ) : null}

          {phase.kind === 'error' ? (
            <Card>
              <Text className="text-base font-semibold text-ink mb-1">
                {t('googleCalendar.couldNotLoad')}
              </Text>
              <Text className="text-sm leading-5 text-ink-muted mb-4">
                {phase.offline ? t('googleCalendar.needsConnection') : t('common.tryAgain')}
              </Text>
              <Button label={t('common.tryAgain')} onPress={load} />
            </Card>
          ) : null}

          {phase.kind === 'ready' ? (
            <ReadyView
              connection={phase.connection}
              draft={draft}
              busy={busy}
              onConnect={connect}
              onStart={startSyncing}
              onChange={changeCalendar}
              onSync={syncAll}
              onRefresh={refreshList}
              onDisconnect={confirmDisconnect}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const ReadyView: React.FC<{
  connection: CalendarConnectionResponse;
  draft: Draft;
  busy: null | 'connect' | 'start' | 'sync' | 'refresh' | 'disconnect';
  onConnect: () => void;
  onStart: () => void;
  onChange: (
    calendar: ExternalCalendar,
    changes: { syncEnabled?: boolean; visibility?: ExternalVisibility },
  ) => void;
  onSync: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}> = ({
  connection,
  draft,
  busy,
  onConnect,
  onStart,
  onChange,
  onSync,
  onRefresh,
  onDisconnect,
}) => {
  const { t } = useTranslation();

  // Not connected, or the grant is gone: explain and offer to (re)connect.
  if (!connection.connected) {
    const reauth = connection.needsReauth;
    return (
      <Card>
        <View className="flex-row items-center mb-2">
          <Icon name={reauth ? 'triangle-alert' : 'calendar'} size={sizes['icon-md']} />
          <Text className="text-lg leading-7 font-semibold text-ink ml-2 flex-1">
            {reauth ? t('googleCalendar.needsReauthTitle') : t('googleCalendar.introTitle')}
          </Text>
        </View>
        <Text className="text-sm leading-5 text-ink-muted mb-4">
          {reauth ? t('googleCalendar.needsReauthBody') : t('googleCalendar.introBody')}
        </Text>
        <Button
          label={
            busy === 'connect'
              ? t('googleCalendar.connecting')
              : reauth
                ? t('googleCalendar.reconnect')
                : t('googleCalendar.connect')
          }
          onPress={onConnect}
          disabled={busy !== null}
        />
        {reauth ? (
          <View className="mt-2">
            <Button
              label={t('googleCalendar.disconnect')}
              variant="ghost"
              onPress={onDisconnect}
              disabled={busy !== null}
            />
          </View>
        ) : null}
      </Card>
    );
  }

  const picking = !connection.confirmed;
  const calendars = connection.calendars;

  return (
    <>
      {picking ? (
        <View className="mb-5">
          <Text className="text-lg leading-7 font-semibold text-ink mb-1">
            {t('googleCalendar.pickerTitle')}
          </Text>
          <Text className="text-sm leading-5 text-ink-muted">{t('googleCalendar.pickerNote')}</Text>
        </View>
      ) : (
        <SectionLabel>{t('googleCalendar.calendarsTitle')}</SectionLabel>
      )}

      {calendars.length === 0 ? <EmptyState message={t('googleCalendar.couldNotLoad')} /> : null}

      {calendars.map((calendar) => (
        <CalendarRow
          key={calendar.id}
          calendar={calendar}
          state={
            draft[calendar.id] ?? {
              syncEnabled: calendar.syncEnabled,
              visibility: calendar.visibility,
            }
          }
          showStatus={!picking}
          onChange={(changes) => onChange(calendar, changes)}
        />
      ))}

      <View className="mb-4">
        <Button
          label={
            busy === 'refresh' ? t('googleCalendar.refreshing') : t('googleCalendar.refreshList')
          }
          variant="ghost"
          onPress={onRefresh}
          disabled={busy !== null}
        />
      </View>

      {picking ? (
        <Button
          label={busy === 'start' ? t('googleCalendar.starting') : t('googleCalendar.startSyncing')}
          onPress={onStart}
          disabled={busy !== null || calendars.length === 0}
        />
      ) : (
        <>
          <Button
            label={busy === 'sync' ? t('googleCalendar.syncing') : t('googleCalendar.syncNow')}
            onPress={onSync}
            disabled={busy !== null}
          />
          <View className="h-2" />
          <Button
            label={t('googleCalendar.disconnect')}
            variant="danger"
            onPress={onDisconnect}
            disabled={busy !== null}
          />
        </>
      )}
    </>
  );
};

const CalendarRow: React.FC<{
  calendar: ExternalCalendar;
  state: { syncEnabled: boolean; visibility: ExternalVisibility };
  showStatus: boolean;
  onChange: (changes: { syncEnabled?: boolean; visibility?: ExternalVisibility }) => void;
}> = ({ calendar, state, showStatus, onChange }) => {
  const { t } = useTranslation();
  const track = useColor('border-strong');
  const on = useColor('action');
  const freeBusyOnly = calendar.accessRole === 'freeBusyReader';
  const visibility = freeBusyOnly ? 'busy_only' : state.visibility;

  const help: Record<ExternalVisibility, string> = {
    shared: t('googleCalendar.sharedHelp'),
    busy_only: t('googleCalendar.busyOnlyHelp'),
    private: t('googleCalendar.privateHelp'),
  };
  const options: Array<{ value: ExternalVisibility; label: string }> = [
    ...(freeBusyOnly ? [] : [{ value: 'shared' as const, label: t('googleCalendar.shared') }]),
    { value: 'busy_only', label: t('googleCalendar.busyOnly') },
    { value: 'private', label: t('googleCalendar.private') },
  ];

  const status = (() => {
    if (!showStatus || !state.syncEnabled) return null;
    if (calendar.lastError === 'rate_limited') return t('googleCalendar.errorRateLimited');
    if (calendar.lastError) return t('googleCalendar.errorSync');
    if (!calendar.lastSyncedAt) return t('googleCalendar.neverSynced');
    return t('googleCalendar.lastSynced', {
      time: new Date(calendar.lastSyncedAt).toLocaleString(),
    });
  })();

  return (
    <Card className="!p-4 !mb-3">
      <View className="flex-row items-center">
        <View
          style={{ backgroundColor: calendar.color ?? '#64748B' }}
          className="w-4 h-4 rounded-full mr-3"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold text-ink" numberOfLines={2}>
            {calendar.name ?? ''}
          </Text>
          {status ? (
            <Text
              className={`text-xs leading-4 mt-0.5 ${calendar.lastError ? 'text-ink' : 'text-ink-muted'}`}
            >
              {status}
            </Text>
          ) : null}
        </View>
        <Switch
          value={state.syncEnabled}
          onValueChange={(value) => onChange({ syncEnabled: value })}
          accessibilityLabel={`${t('googleCalendar.sync')}: ${calendar.name ?? ''}`}
          trackColor={{ false: track, true: on }}
        />
      </View>

      {state.syncEnabled ? (
        <View className="mt-4">
          <Text className="text-sm font-semibold text-ink-muted mb-1.5">
            {t('googleCalendar.visibility')}
          </Text>
          <Segmented<ExternalVisibility>
            value={visibility}
            onChange={(value) => onChange({ visibility: value })}
            options={options}
          />
          <Text className="text-xs leading-4 text-ink-muted mt-2">
            {freeBusyOnly ? t('googleCalendar.freeBusyNote') : help[visibility]}
          </Text>
        </View>
      ) : null}
    </Card>
  );
};
