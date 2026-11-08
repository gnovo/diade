import { sizes, space as spacing } from '@diade/design-tokens';
import {
  type ExternalEvent,
  type ExternalVisibility,
  externalEventTitle,
  formatTime,
  parseDateOnly,
} from '@diade/domain';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import type { AgendaEntry } from '../data/unifiedAgenda';
import { Icon, useColor } from '../design';
import { useFormat } from '../i18n';
import { useSync } from '../sync/SyncProvider';
import { Button, Card, SectionLabel, Segmented, type SegmentOption } from './ui';

type ExternalEntry = Extract<AgendaEntry, { kind: 'external' }>;
type Override = 'inherit' | 'busy_only' | 'private';

/**
 * A synced Google event. Read-only: edits happen in Google Calendar. The owner can narrow
 * who sees one event (never widen it past its calendar). A partner's busy-only block shows
 * nothing beyond the fact that they are busy.
 */
export const ExternalEventDetail: React.FC<{
  entry: ExternalEntry | null;
  onClose: () => void;
}> = ({ entry, onClose }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const { syncNow } = useSync();
  const event = entry?.event ?? null;
  const [override, setOverride] = useState<Override>('inherit');
  const [starred, setStarred] = useState(false);
  const starColor = useColor('warning');

  useEffect(() => {
    setOverride((event?.visibilityOverride as Override | null) ?? 'inherit');
  }, [event?.id, event?.visibilityOverride]);

  useEffect(() => {
    setStarred(event?.highlighted ?? false);
  }, [event?.id, event?.highlighted]);

  const labels = { busy: t('calendar.busy'), untitled: t('calendar.untitled') };

  const when = (e: ExternalEvent): string => {
    if (e.isAllDay) {
      const start = e.startDate ? parseDateOnly(e.startDate) : null;
      const end = e.endDate ? parseDateOnly(e.endDate) : null;
      if (!start) return t('format.allDay');
      const first = format.longDate(start);
      return end && end.getTime() !== start.getTime()
        ? `${first} – ${format.longDate(end)}`
        : `${first} · ${t('format.allDay')}`;
    }
    if (!e.startAt || !e.endAt) return '';
    const start = new Date(e.startAt);
    return `${format.longDate(start)} · ${formatTime(start)}–${formatTime(new Date(e.endAt))}`;
  };

  // An event can only be made more private than its calendar, never less.
  const calendarVisibility: ExternalVisibility = entry?.calendar?.visibility ?? 'shared';
  const overrideOptions: SegmentOption<Override>[] = [
    { value: 'inherit', label: t('calendar.detail.sameAsCalendar') },
    ...(calendarVisibility === 'shared'
      ? [{ value: 'busy_only' as const, label: t('googleCalendar.busyOnly') }]
      : []),
    ...(calendarVisibility !== 'private'
      ? [{ value: 'private' as const, label: t('googleCalendar.private') }]
      : []),
  ];

  const toggleStar = async () => {
    if (!event) return;
    const next = !starred;
    setStarred(next);
    try {
      await apiClient.updateExternalEvent(event.id, { highlighted: next });
      syncNow();
    } catch (err) {
      setStarred(!next);
      Alert.alert(
        t('calendar.detail.couldNotSave'),
        err instanceof Error ? err.message : t('googleCalendar.needsConnection'),
      );
    }
  };

  // The partner only ever sees the event as "busy", so a star on it would mean nothing to them.
  const starNote =
    starred && entry?.mine && entry.event.effectiveVisibility !== 'shared'
      ? t('calendar.highlightBusyNote')
      : null;

  const changeOverride = async (next: Override) => {
    if (!event) return;
    const previous = override;
    setOverride(next);
    try {
      await apiClient.updateExternalEvent(event.id, {
        visibilityOverride: next === 'inherit' ? null : next,
      });
      syncNow();
    } catch (err) {
      setOverride(previous);
      Alert.alert(
        t('calendar.detail.couldNotSave'),
        err instanceof Error ? err.message : t('googleCalendar.needsConnection'),
      );
    }
  };

  return (
    <Modal visible={entry !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('calendar.detail.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center"
          >
            <Icon name="x" size={sizes['icon-md']} />
          </Pressable>
          {entry?.mine && event ? (
            <Pressable
              onPress={toggleStar}
              accessibilityRole="switch"
              accessibilityState={{ checked: starred }}
              accessibilityLabel={t('calendar.highlight')}
              hitSlop={8}
              className="flex-row items-center h-11 px-4 rounded-full bg-surface-sunken"
            >
              <Icon
                name="star"
                size={sizes['icon-md']}
                color={starred ? starColor : undefined}
                fill={starred ? starColor : undefined}
              />
              <Text className="ml-2 text-sm font-semibold text-ink">
                {starred ? t('calendar.highlighted') : t('calendar.highlight')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {entry && event ? (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing[4],
              paddingTop: spacing[2],
              paddingBottom: spacing[8],
            }}
          >
            <View className="flex-row items-center mb-1">
              <View
                style={{ backgroundColor: entry.calendar?.color ?? '#64748B' }}
                className="w-3 h-3 rounded-full mr-2"
                importantForAccessibility="no-hide-descendants"
              />
              <Text className="text-sm text-ink-muted flex-1" numberOfLines={1}>
                {entry.mine
                  ? (entry.calendar?.name ?? t('calendar.mine'))
                  : (entry.calendar?.name ?? t('calendar.partnerCalendar'))}
              </Text>
            </View>
            <Text className="text-title-1 font-bold text-ink mb-4">
              {externalEventTitle(event, labels)}
            </Text>

            {event.status === 'tentative' ? (
              <Text className="text-sm text-ink-muted mb-2">{t('calendar.detail.tentative')}</Text>
            ) : null}
            {event.myResponse === 'declined' ? (
              <Text className="text-sm text-ink-muted mb-2">{t('calendar.detail.declined')}</Text>
            ) : null}

            <Card>
              <SectionLabel>{t('calendar.detail.when')}</SectionLabel>
              <Text className="text-base leading-6 text-ink">{when(event)}</Text>
              {event.location ? (
                <>
                  <View className="h-px bg-border my-4" />
                  <SectionLabel>{t('calendar.detail.where')}</SectionLabel>
                  <Text className="text-base leading-6 text-ink">{event.location}</Text>
                </>
              ) : null}
              {event.description ? (
                <>
                  <View className="h-px bg-border my-4" />
                  <SectionLabel>{t('calendar.detail.notes')}</SectionLabel>
                  <Text className="text-base leading-6 text-ink" selectable>
                    {event.description}
                  </Text>
                </>
              ) : null}
            </Card>

            {starred ? (
              <Text className="text-sm leading-5 text-ink-muted mb-2">
                {starNote ?? t('calendar.highlightHint')}
              </Text>
            ) : null}

            {event.redacted ? (
              <Text className="text-sm leading-5 text-ink-muted">
                {t('calendar.detail.partnerBusy')}
              </Text>
            ) : (
              <Text className="text-sm leading-5 text-ink-muted mb-4">
                {t('calendar.detail.readOnly')}
              </Text>
            )}

            {entry.mine ? (
              <>
                {overrideOptions.length > 1 ? (
                  <Card>
                    <SectionLabel>{t('calendar.detail.visibility')}</SectionLabel>
                    <Segmented<Override>
                      value={override}
                      onChange={changeOverride}
                      options={overrideOptions}
                    />
                  </Card>
                ) : null}
                {event.htmlLink ? (
                  <Button
                    label={t('calendar.detail.openInGoogle')}
                    variant="ghost"
                    onPress={() => Linking.openURL(event.htmlLink!).catch(() => undefined)}
                  />
                ) : null}
              </>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};
