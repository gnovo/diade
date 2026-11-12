import type { TrainingCalendarStatus } from '@diade/contracts';
import {
  type CalendarEvent,
  cycleWeek,
  DEFAULT_GOALS,
  DEFAULT_TEMPLATE,
  formatTime,
  GOAL_KINDS,
  type GoalKind,
  isDoneOn,
  nextBlock,
  setDone,
  type TrainingSettings,
  templateEvents,
  toDateInputValue,
  type WeeklyGoals,
  weekProgress,
  weekStart,
} from '@diade/domain';
import { formatDayLabel, formatLongDate, type TFunction } from '@diade/i18n';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import { connectGoogleTraining } from '../calendar/connect';
import { useTraining } from '../context/TrainingContext';
import { getActiveEvents } from '../data/queries';
import { updateRecord, writeBatch } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import { Icon, useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { Button, Card, SectionLabel, Segmented, useWriteContext } from './ui';

const NO_EVENTS: CalendarEvent[] = [];
/** Stable keys for the goal dots (a goal is at most 14). */
const SLOTS = Array.from({ length: 14 }, (_, n) => `slot-${n}`);

const failed = (t: TFunction) => (err: unknown) =>
  Alert.alert(t('common.couldNotSave'), err instanceof Error ? err.message : t('common.tryAgain'));

/** A goal from 0 to 14, with a minus and a plus. */
const GoalStepper: React.FC<{ label: string; value: number; onChange: (next: number) => void }> = ({
  label,
  value,
  onChange,
}) => {
  const ink = useColor('ink');
  const muted = useColor('ink-muted');
  const { t } = useTranslation();
  const button = (delta: number, icon: 'minus' | 'plus', disabled: boolean, a11y: string) => (
    <Pressable
      onPress={() => onChange(value + delta)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      className="w-12 h-12 rounded-full border border-border-strong items-center justify-center active:bg-surface-sunken"
    >
      <Icon name={icon} color={disabled ? muted : ink} />
    </Pressable>
  );
  return (
    <View className="flex-row items-center min-h-[56px]">
      <Text className="flex-1 text-base text-ink mr-2">{label}</Text>
      {button(-1, 'minus', value <= 0, t('training.fewer', { kind: label }))}
      <Text
        className="w-10 text-center text-lg font-semibold text-ink"
        accessibilityLiveRegion="polite"
      >
        {value}
      </Text>
      {button(1, 'plus', value >= 14, t('training.more', { kind: label }))}
    </View>
  );
};

/**
 * Whether the blocks are copied to the member's Google calendar "Díade · Treino" (shown as free, so they never block
 * a meeting). Turning it on asks Google for the extra grant the first time; turning it off deletes that calendar.
 */
const GoogleTrainingCard: React.FC<{ visible: boolean }> = ({ visible }) => {
  const { t } = useTranslation();
  const track = useColor('border-strong');
  const on = useColor('action');
  const [status, setStatus] = useState<TrainingCalendarStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState(false);
  if (visible !== loadedFor) {
    setLoadedFor(visible);
    if (visible) {
      apiClient
        .getTrainingCalendar()
        .then(setStatus)
        .catch(() => setStatus(null));
    }
  }

  const turnOn = async () => {
    if (!status?.canWrite) {
      const connected = await connectGoogleTraining();
      if (!connected.ok) {
        Alert.alert(
          t('training.google.notAllowedTitle'),
          connected.message ?? t('training.google.notAllowed'),
        );
        return;
      }
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Lisbon';
    setStatus(await apiClient.enableTrainingCalendar(timeZone));
  };

  const toggle = async (value: boolean) => {
    setBusy(true);
    try {
      if (value) await turnOn();
      else setStatus(await apiClient.disableTrainingCalendar());
    } catch (err) {
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.checkConnection'),
      );
    } finally {
      setBusy(false);
    }
  };

  const enabled = status?.enabled ?? false;
  const note = !status
    ? t('training.google.offline')
    : !enabled
      ? t('training.google.hint')
      : status.lastError === 'needs_reauth'
        ? t('training.google.needsReauth')
        : status.lastError === 'failed'
          ? t('training.google.failed')
          : t('training.google.copied', { count: status.blocks });
  return (
    <Card>
      <View className="flex-row items-center">
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold text-ink">{t('training.google.title')}</Text>
          <Text className="text-sm leading-5 text-ink-muted mt-0.5">{note}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={toggle}
          disabled={busy || !status}
          accessibilityLabel={t('training.google.title')}
          trackColor={{ false: track, true: on }}
        />
      </View>
      {enabled && status?.lastError === 'needs_reauth' ? (
        <View className="mt-3">
          <Button
            label={t('training.google.reconnect')}
            variant="outline"
            onPress={() => toggle(true)}
          />
        </View>
      ) : null}
    </Card>
  );
};

/**
 * Profile → Training: which week of the work cycle this is, the weekly goals for each week, and the default week of
 * blocks written to the calendar as recurring personal events (which the member then edits like any event).
 */
export const TrainingSettingsScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const { training, save } = useTraining();
  const events = useLiveQuery(getActiveEvents, NO_EVENTS);
  const blocks = events.data.filter((e) => e.category === 'workout');
  const today = new Date();
  const thisMonday = weekStart(today);
  const [week, setWeek] = useState<'1' | '2'>('1');
  const [shown, setShown] = useState<'week1' | 'week2'>('week1');
  const [goals, setGoals] = useState<TrainingSettings['goals']>(DEFAULT_GOALS);
  const [wasVisible, setWasVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setWeek(training ? (String(cycleWeek(training.cycleAnchor, today)) as '1' | '2') : '1');
      setGoals(training?.goals ?? DEFAULT_GOALS);
      setShown('week1');
    }
  }
  // The anchor is the Monday that started the current cycle's week 1.
  const anchorDate = new Date(thisMonday);
  if (week === '2') anchorDate.setDate(anchorDate.getDate() - 7);
  const settings: TrainingSettings = { cycleAnchor: toDateInputValue(anchorDate), goals };
  const setGoal = (kind: GoalKind) => (next: number) =>
    setGoals((g) => ({ ...g, [shown]: { ...g[shown], [kind]: Math.max(0, Math.min(14, next)) } }));

  const saveOnly = async () => {
    setBusy(true);
    try {
      await save(settings);
      onClose();
    } catch (err) {
      failed(t)(err);
    } finally {
      setBusy(false);
    }
  };

  // Writes the default week as blocks, replacing the blocks there are: one batch, so it is all or nothing locally.
  const createBlocks = async () => {
    if (!ctx) return;
    setBusy(true);
    try {
      await save(settings);
      const writes = [
        ...blocks.map((b) => ({ op: 'delete' as const, entity: 'events' as const, id: b.id })),
        ...templateEvents(DEFAULT_TEMPLATE, settings.cycleAnchor, today).map((block) => ({
          op: 'insert' as const,
          entity: 'events' as const,
          input: {
            title: t(`training.titles.${block.spec.kind}`),
            startAt: block.startAt,
            endAt: block.endAt,
            isAllDay: false,
            visibility: 'personal',
            recurrenceRule: block.recurrenceRule,
            category: block.category,
            highlighted: false,
            workout: block.workout,
          },
        })),
      ];
      await writeBatch(ctx, writes);
      onClose();
    } catch (err) {
      failed(t)(err);
    } finally {
      setBusy(false);
    }
  };

  const confirmCreate = () =>
    blocks.length === 0
      ? createBlocks()
      : Alert.alert(
          t('training.replaceTitle'),
          t('training.replaceBody', { count: blocks.length }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('training.replace'), style: 'destructive', onPress: createBlocks },
          ],
        );

  const weekGoals: WeeklyGoals = goals[shown];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 pt-2 pb-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('training.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center mr-3"
          >
            <Icon name="x" />
          </Pressable>
          <Text className="flex-1 text-title-2 font-bold text-ink">{t('training.title')}</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
          <SectionLabel>{t('training.cycle')}</SectionLabel>
          <Card>
            <Text className="text-sm leading-5 text-ink-muted mb-3">{t('training.cycleHint')}</Text>
            <Segmented<'1' | '2'>
              value={week}
              onChange={setWeek}
              options={[
                { value: '1', label: t('training.thisIsWeek', { week: 1 }) },
                { value: '2', label: t('training.thisIsWeek', { week: 2 }) },
              ]}
            />
            <Text className="text-xs leading-4 text-ink-muted mt-3">
              {t('training.anchor', { date: formatLongDate(t, anchorDate) })}
            </Text>
          </Card>

          <SectionLabel>{t('training.goals')}</SectionLabel>
          <Card>
            <Segmented<'week1' | 'week2'>
              value={shown}
              onChange={setShown}
              options={[
                { value: 'week1', label: t('training.week', { week: 1 }) },
                { value: 'week2', label: t('training.week', { week: 2 }) },
              ]}
            />
            <View className="mt-2">
              {GOAL_KINDS.map((kind) => (
                <GoalStepper
                  key={kind}
                  label={t(`training.kinds.${kind}`)}
                  value={weekGoals[kind]}
                  onChange={setGoal(kind)}
                />
              ))}
            </View>
            <Text className="text-xs leading-4 text-ink-muted mt-2">{t('training.goalsHint')}</Text>
          </Card>

          <SectionLabel>{t('training.blocks')}</SectionLabel>
          <Card>
            <Text className="text-sm leading-5 text-ink-muted mb-3">
              {blocks.length > 0
                ? t('training.blocksExist', { count: blocks.length })
                : t('training.blocksNone')}
            </Text>
            <Button
              label={blocks.length > 0 ? t('training.recreate') : t('training.create')}
              variant="outline"
              onPress={confirmCreate}
              disabled={busy}
            />
          </Card>
          <GoogleTrainingCard visible={visible} />
          <Button label={t('common.save')} onPress={saveOnly} disabled={busy} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

/** One occurrence of a block: when, the session it fits, what it counts towards, and done or not today. */
export const BlockSheet: React.FC<{
  block: { event: CalendarEvent; startAt: Date } | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}> = ({ block, onClose, onEdit }) => {
  const { t } = useTranslation();
  const { training } = useTraining();
  const events = useLiveQuery(getActiveEvents, NO_EVENTS);
  const live = block ? (events.data.find((e) => e.id === block.event.id) ?? block.event) : null;
  const workout = live?.workout ?? null;
  const done = block && workout ? isDoneOn(workout, block.startAt) : false;
  const kind = workout?.kind;
  const progress =
    training && block && kind && kind !== 'other'
      ? weekProgress(events.data, training, block.startAt).find((p) => p.kind === kind)
      : undefined;

  const toggle = () => {
    if (!live || !workout || !block) return;
    updateRecord('events', live.id, { workout: setDone(workout, block.startAt, !done) })
      .then(onClose)
      .catch(failed(t));
  };

  const end =
    block && live
      ? new Date(
          block.startAt.getTime() +
            (new Date(live.endAt).getTime() - new Date(live.startAt).getTime()),
        )
      : null;
  return (
    <BottomSheet visible={block !== null} onClose={onClose} title={live?.title ?? ''}>
      {block && live && end ? (
        <View className="pb-2">
          <Text className="text-base text-ink">
            {t('training.when', {
              day: formatDayLabel(t, block.startAt),
              start: formatTime(block.startAt),
              end: formatTime(end),
            })}
          </Text>
          {workout && workout.durationMin > 0 ? (
            <Text className="text-sm text-ink-muted mt-1">
              {t('training.session', { minutes: workout.durationMin })}
            </Text>
          ) : null}
          {progress ? (
            <Text className="text-sm text-ink-muted mt-1">
              {t('training.countsTowards', {
                kind: t(`training.kinds.${progress.kind}`),
                done: progress.done,
                goal: progress.goal,
              })}
            </Text>
          ) : null}
          <View className="mt-5 gap-3">
            {kind && kind !== 'other' ? (
              <Button
                label={done ? t('training.undo') : t('training.markDone')}
                variant={done ? 'outline' : 'primary'}
                onPress={toggle}
              />
            ) : null}
            {!done && kind !== 'other' ? (
              <Button label={t('training.notToday')} variant="outline" onPress={onClose} />
            ) : null}
            <Button
              label={t('training.editBlock')}
              variant="ghost"
              onPress={() => {
                onClose();
                onEdit(live);
              }}
            />
          </View>
          {!done && kind !== 'other' ? (
            <Text className="text-xs leading-4 text-ink-muted mt-3">
              {t('training.notTodayHint')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
};

/** Today: how the week's training is going against its goals, and the next block that still counts. */
export const TodayTraining: React.FC = () => {
  const { t } = useTranslation();
  const { training } = useTraining();
  const events = useLiveQuery(getActiveEvents, NO_EVENTS);
  if (!training) return null;
  const now = new Date();
  const progress = weekProgress(events.data, training, now);
  const next = nextBlock(events.data, training, now);
  const week = cycleWeek(training.cycleAnchor, now);
  const goals = progress.filter((p) => p.goal > 0);
  if (goals.length === 0) return null;
  return (
    <Card>
      <SectionLabel
        right={
          <Text className="text-xs leading-4 text-ink-muted">
            {t('training.cycleWeek', { week })}
          </Text>
        }
      >
        {t('training.thisWeek')}
      </SectionLabel>
      {goals.map((p) => (
        <View key={p.kind} className="flex-row items-center min-h-[36px]">
          <Text className="flex-1 text-sm font-semibold text-ink">
            {t(`training.kinds.${p.kind}`)}
          </Text>
          <View className="flex-row gap-1.5 mr-3" accessibilityElementsHidden>
            {SLOTS.slice(0, p.goal).map((slot, i) => (
              <View
                key={slot}
                className={`w-3 h-3 rounded-full ${i < p.done ? 'bg-action' : 'border border-border-strong'}`}
              />
            ))}
          </View>
          <Text className="w-14 text-sm text-ink-muted text-right">
            {t('training.progress', { done: p.done, goal: p.goal })}
          </Text>
        </View>
      ))}
      {next ? (
        <View className="mt-3 rounded-md border border-dashed border-border-strong px-3 py-2">
          <Text className="text-sm text-ink">
            {t('training.next', {
              title: next.event.title,
              day: formatDayLabel(t, next.startAt),
              start: formatTime(next.startAt),
            })}
          </Text>
        </View>
      ) : (
        <Text className="text-sm text-ink-muted mt-2">{t('training.weekDone')}</Text>
      )}
    </Card>
  );
};
