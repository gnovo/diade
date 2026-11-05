import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  addLocalDays,
  canAccessRecord,
  describeImportantDate,
  externalEventTitle,
  formatTime,
  isTaskAssignedToUser,
  startOfLocalDay,
  type Task,
  type CalendarEvent,
  type ExternalCalendar,
  type ExternalEvent,
  type ImportantDate,
} from '@diade/domain';
import { sizes } from '@diade/design-tokens';
import { useAuth } from '../context/AuthContext';
import {
  getActiveEvents,
  getActiveTasks,
  getActiveLists,
  getActiveListItems,
  getActiveImportantDates,
  getExternalCalendars,
  getExternalEvents,
  getInboxItems,
} from '../data/queries';
import { buildUnifiedAgenda, pickHighlights, type AgendaEntry } from '../data/unifiedAgenda';
import { Icon, useColor } from '../design';
import { statusLabel } from '../data/importantDateDisplay';
import { insertRecord, updateRecord } from '../data/repository';
import { formatAgendaTime } from '../data/agenda';
import { useLiveQuery } from '../data/useLiveQuery';
import { useFormat } from '../i18n';
import { Button, Card, Checkbox, EmptyState, Pill, ScreenScaffold, SectionLabel, TextField, useWriteContext } from '../components/ui';

const TODAY_TASK_LIMIT = 5;
const EVENT_LIMIT = 4;
const HIGHLIGHT_LIMIT = 5;
const LOOKAHEAD_DAYS = 30;

export const TodayScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, members } = useAuth();
  const ctx = useWriteContext();
  const [captureText, setCaptureText] = useState('');
  const [saving, setSaving] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);

  const now = new Date();
  const starColor = useColor('warning');
  const dayStart = startOfLocalDay(now);
  const tomorrowEnd = addLocalDays(dayStart, 2);

  const events = useLiveQuery(getActiveEvents, [] as CalendarEvent[]);
  const externalEvents = useLiveQuery(getExternalEvents, [] as ExternalEvent[]);
  const externalCalendars = useLiveQuery(getExternalCalendars, [] as ExternalCalendar[]);
  const tasks = useLiveQuery(getActiveTasks, [] as Task[]);
  const lists = useLiveQuery(getActiveLists, []);
  const listItems = useLiveQuery(getActiveListItems, []);
  const inbox = useLiveQuery(getInboxItems, []);
  const specialDates = useLiveQuery(getActiveImportantDates, [] as ImportantDate[]);

  // Díade events and Google events for today and tomorrow. Tasks and special days have their own cards.
  const upcoming = buildUnifiedAgenda({
    events: events.data.filter((e) => e.category === 'general'),
    externalEvents: externalEvents.data,
    externalCalendars: externalCalendars.data,
    tasks: [],
    importantDates: [],
    userId: user?.id ?? '',
    from: dayStart,
    to: tomorrowEnd,
  })
    .days.flatMap((d) => d.entries)
    .filter((entry) => {
      // Skip what has already finished today. All-day items stay for the whole day.
      if (entry.kind === 'event') return entry.item.endAt.getTime() >= now.getTime();
      if (entry.kind === 'external') return entry.isAllDay || entry.endAt!.getTime() >= now.getTime();
      return false;
    })
    .slice(0, EVENT_LIMIT);

  // Starred events ahead, wherever they fall in the next couple of months. The Calendar screen's
  // calendar filters do not apply: a star is a deliberate choice.
  const highlights = pickHighlights(
    buildUnifiedAgenda({
      events: events.data.filter((e) => e.category === 'general'),
      externalEvents: externalEvents.data,
      externalCalendars: externalCalendars.data,
      tasks: [],
      importantDates: [],
      userId: user?.id ?? '',
      from: dayStart,
      to: new Date(dayStart.getFullYear(), dayStart.getMonth() + 2, dayStart.getDate()),
    }),
    now,
    HIGHLIGHT_LIMIT,
  );

  // The featured date always shows; then whatever else lands in the next 30 days.
  const importantDates = (() => {
    const described = specialDates.data.map((item) => ({ item, status: describeImportantDate(item, now) }));
    const featured = described.filter((d) => d.item.pinned);
    const soon = described
      .filter((d) => !d.item.pinned && d.status.kind !== 'since' && d.status.days <= LOOKAHEAD_DAYS)
      .sort((a, b) => a.status.days - b.status.days);
    return [...featured, ...soon].slice(0, 3);
  })();

  const myOpenTasks = tasks.data.filter(
    (t) => t.status === 'todo' && canAccessRecord(t, user?.id ?? '') && isTaskAssignedToUser(t, user?.id ?? ''),
  );
  const isOverdue = (task: Task) => !!task.dueDate && startOfLocalDay(new Date(task.dueDate)).getTime() < dayStart.getTime();

  // Overdue and important tasks stay on top until they are done, so they cannot slip by.
  const needsAttention = myOpenTasks
    .filter((t) => isOverdue(t) || t.priority === 'important')
    .sort(
      (a, b) =>
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity),
    );
  const attentionIds = new Set(needsAttention.map((t) => t.id));
  const openTasks = myOpenTasks.filter((t) => !attentionIds.has(t.id)).slice(0, TODAY_TASK_LIMIT);

  const groceryListIds = new Set(lists.data.filter((l) => l.category === 'groceries').map((l) => l.id));
  const openGroceries = listItems.data.filter((i) => groceryListIds.has(i.listId) && !i.isChecked);

  const partnerName = (id: string | null) => {
    if (id === null) return t('common.both');
    if (id === user?.id) return t('common.me');
    return members.find((m) => m.userId === id)?.displayName ?? t('common.partner');
  };

  const toggleTask = async (task: Task) => {
    const completing = task.status !== 'completed';
    await updateRecord('tasks', task.id, {
      status: completing ? 'completed' : 'todo',
      completedAt: completing ? new Date().toISOString() : null,
    });
  };

  const handleCapture = async () => {
    const content = captureText.trim();
    if (!content || !ctx) return;
    try {
      setSaving(true);
      await insertRecord('capture_items', ctx, { content, captureType: 'text', status: 'inbox' });
      setCaptureText('');
      setCaptureNote(t('today.savedToInbox'));
    } catch (err) {
      Alert.alert(t('common.couldNotSave'), err instanceof Error ? err.message : t('common.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  /** Title, time, and pill for an event entry. */
  const rowOf = (entry: AgendaEntry) =>
            entry.kind === 'event'
      ? {
          title: entry.item.title,
          when: `${format.dayLabel(entry.item.startAt, now)} · ${formatAgendaTime(t, entry.item)}`,
          pill: (
            <Pill
              label={entry.item.visibility === 'shared' ? t('common.shared') : t('common.personal')}
              tone={entry.item.visibility}
            />
          ),
          muted: false,
        }
      : entry.kind === 'external'
        ? {
            title: externalEventTitle(entry.event, { busy: t('calendar.busy'), untitled: t('calendar.untitled') }),
            when: `${format.dayLabel(entry.day, now)} · ${
              entry.isAllDay ? t('format.allDay') : `${formatTime(entry.startAt!)}–${formatTime(entry.endAt!)}`
            }`,
            pill: <Pill label={entry.mine ? t('calendar.mine') : partnerName(entry.event.userId)} />,
            muted: entry.event.redacted,
          }
        : null;

  return (
    <ScreenScaffold
      eyebrow={format.longDate(now)}
      title={t('today.title')}
    >
      {/* Quick capture: text only for now; saved locally first, synced when possible */}
      <View className="bg-surface rounded-full border border-border px-4 py-2 flex-row items-center mb-2">
        <TextField
          value={captureText}
          onChangeText={(t: string) => {
            setCaptureText(t);
            setCaptureNote(null);
          }}
          onSubmitEditing={handleCapture}
          placeholder={t('today.capturePlaceholder')}
          returnKeyType="done"
          maxLength={5000}
          className="flex-1 text-ink text-sm py-1"
          style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 }}
        />
        <Button label={saving ? '…' : t('common.save')} small onPress={handleCapture} disabled={saving || !captureText.trim()} />
      </View>
      <View className="flex-row justify-between px-2 mb-6">
        <Text className="text-sm text-ink-muted">{captureNote ?? (inbox.data.length ? t('today.inInbox', { count: inbox.data.length }) : ' ')}</Text>
      </View>

      {highlights.length > 0 ? (
        <Card>
          <SectionLabel>{t('today.highlights')}</SectionLabel>
          {highlights.map((entry, index) => {
            const row = rowOf(entry);
            if (!row) return null;
            return (
              <View key={entry.key}>
                {index > 0 ? <View className="h-px bg-border my-3" /> : null}
                <View className="flex-row items-center justify-between">
                  <View className="mr-2">
                    <Icon name="star" size={sizes['icon-sm']} color={starColor} fill={starColor} />
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className={`text-base font-semibold ${row.muted ? 'text-ink-muted' : 'text-ink'}`} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text className="text-sm text-ink-muted mt-0.5">{row.when}</Text>
                  </View>
                  {row.pill}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card>
        <SectionLabel>{t('today.comingUp')}</SectionLabel>
        {upcoming.length === 0 ? <EmptyState message={t('today.nothingComingUp')} /> : null}
        {upcoming.map((entry, index) => {
          const row = rowOf(entry);
          if (!row) return null;
          return (
            <View key={entry.key}>
              {index > 0 ? <View className="h-px bg-border my-3" /> : null}
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Text className={`text-base font-semibold ${row.muted ? 'text-ink-muted' : 'text-ink'}`} numberOfLines={1}>
                    {row.title}
                  </Text>
                  <Text className="text-sm text-ink-muted mt-0.5">{row.when}</Text>
                </View>
                {row.pill}
              </View>
            </View>
          );
        })}
      </Card>

      {needsAttention.length > 0 ? (
        <Card className="border-border-strong">
          <SectionLabel>{t('today.needsAttention')}</SectionLabel>
          {needsAttention.slice(0, TODAY_TASK_LIMIT).map((task, index) => (
            <View key={task.id}>
              {index > 0 ? <View className="h-px bg-border my-3" /> : null}
              <View className="flex-row items-center">
                <Checkbox checked={false} onToggle={() => toggleTask(task)} label={t('today.complete', { title: task.title })} />
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-medium text-ink" numberOfLines={1}>{task.title}</Text>
                  {isOverdue(task) ? (
                    <Text className="text-xs text-ink-muted">
                      {t('today.overdue')} · {t('household.due', { day: format.dayLabel(new Date(task.dueDate!), now) })}
                    </Text>
                  ) : null}
                </View>
                {task.priority === 'important' ? (
                  <View className="mr-2">
                    <Icon name="star" size={sizes['icon-sm']} title={t('today.importantTask')} />
                  </View>
                ) : null}
                <Pill label={partnerName(task.assigneeId)} />
              </View>
            </View>
          ))}
          {needsAttention.length > TODAY_TASK_LIMIT ? (
            <Text className="text-sm text-ink-muted mt-3">{t('today.more', { count: needsAttention.length - TODAY_TASK_LIMIT })}</Text>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionLabel>{t('today.tasksDueSoon')}</SectionLabel>
        {openTasks.length === 0 ? <EmptyState message={t('today.noOpenTasks')} /> : null}
        {openTasks.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center">
              <Checkbox checked={false} onToggle={() => toggleTask(task)} label={t('today.complete', { title: task.title })} />
              <Text className="flex-1 text-sm font-medium text-ink mr-2" numberOfLines={1}>{task.title}</Text>
              <Pill label={partnerName(task.assigneeId)} />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionLabel>{t('today.groceries')}</SectionLabel>
        {openGroceries.length === 0 ? (
          <EmptyState message={t('today.nothingToBuy')} />
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {openGroceries.slice(0, 4).map((item) => (
              <View key={item.id} className="bg-surface-sunken border border-border px-3 py-1.5 rounded-full">
                <Text className="text-base font-medium text-ink">{item.name}</Text>
              </View>
            ))}
            {openGroceries.length > 4 ? (
              <View className="bg-bg border border-border px-3 py-1.5 rounded-full">
                <Text className="text-sm text-ink-muted">{t('today.more', { count: openGroceries.length - 4 })}</Text>
              </View>
            ) : null}
          </View>
        )}
      </Card>

      {importantDates.length > 0 ? (
        <Card>
          <SectionLabel>{t('today.importantDates')}</SectionLabel>
          {importantDates.map(({ item, status }, index) => (
            <View key={item.id} className={`flex-row items-center justify-between ${index > 0 ? 'mt-3' : ''}`}>
              <Text className="flex-1 mr-3 text-base font-semibold text-ink" numberOfLines={2}>{item.title}</Text>
              <Text className="text-sm text-ink-muted">{statusLabel(t, status)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </ScreenScaffold>
  );
};
