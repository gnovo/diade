import { sizes } from '@diade/design-tokens';
import {
  addLocalDays,
  type CalendarEvent,
  canAccessRecord,
  type ExternalCalendar,
  type ExternalEvent,
  externalEventTitle,
  formatTime,
  type ImportantDate,
  isTaskAssignedToUser,
  startOfLocalDay,
  type Task,
} from '@diade/domain';
import { useNavigation } from '@react-navigation/native';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Pill,
  ScreenScaffold,
  SectionLabel,
  TextField,
  useWriteContext,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { formatAgendaTime } from '../data/agenda';
import { statusLabel } from '../data/importantDateDisplay';
import { inviteState } from '../data/invite';
import { partnerDay } from '../data/partnerDay';
import {
  getActiveEvents,
  getActiveImportantDates,
  getActiveListItems,
  getActiveLists,
  getActiveTasks,
  getExternalCalendars,
  getExternalEvents,
  getInboxItems,
} from '../data/queries';
import { insertRecord, updateRecord } from '../data/repository';
import { type AgendaEntry, buildUnifiedAgenda, pickHighlights } from '../data/unifiedAgenda';
import { useLiveQuery } from '../data/useLiveQuery';
import { upcomingSpecialDates, usStrip } from '../data/usStrip';
import { AvatarPair, Icon, useColor } from '../design';
import { useFormat } from '../i18n';
import { PartnerDayScreen } from './PartnerDayScreen';
import { ProfileScreen, userInitial } from './ProfileScreen';

const TODAY_TASK_LIMIT = 5;
const EVENT_LIMIT = 4;
const HIGHLIGHT_LIMIT = 5;
const LOOKAHEAD_DAYS = 30;

export const TodayScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, space, members } = useAuth();
  const ctx = useWriteContext();
  const [captureText, setCaptureText] = useState('');
  const [saving, setSaving] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [partnerOpen, setPartnerOpen] = useState(false);

  const now = new Date();
  const starColor = useColor('warning');
  const onAction = useColor('on-action');
  const navigation = useNavigation<any>();
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
      if (entry.kind === 'external')
        return entry.isAllDay || entry.endAt!.getTime() >= now.getTime();
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

  const myOpenTasks = tasks.data.filter(
    (t) =>
      t.status === 'todo' &&
      canAccessRecord(t, user?.id ?? '') &&
      isTaskAssignedToUser(t, user?.id ?? ''),
  );
  const isOverdue = (task: Task) =>
    !!task.dueDate && startOfLocalDay(new Date(task.dueDate)).getTime() < dayStart.getTime();

  // Overdue and important tasks stay on top until they are done, so they cannot slip by.
  const needsAttention = myOpenTasks
    .filter((t) => isOverdue(t) || t.priority === 'important')
    .sort(
      (a, b) =>
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
          (b.dueDate ? new Date(b.dueDate).getTime() : Infinity),
    );
  const attentionIds = new Set(needsAttention.map((t) => t.id));
  const openTasks = myOpenTasks.filter((t) => !attentionIds.has(t.id)).slice(0, TODAY_TASK_LIMIT);

  // How much is on today, and the nearest special day, for the greeting's one-line status.
  const tomorrowStart = addLocalDays(dayStart, 1);
  const todayCount =
    needsAttention.length +
    upcoming.filter((entry) =>
      entry.kind === 'event'
        ? entry.item.startAt < tomorrowStart
        : entry.kind === 'external'
          ? entry.day < tomorrowStart
          : false,
    ).length;
  const nextSpecial = upcomingSpecialDates(specialDates.data, now, LOOKAHEAD_DAYS)[0];
  const strip = usStrip(specialDates.data, now, LOOKAHEAD_DAYS);
  const statusLine = [
    todayCount > 0 ? t('today.statusCount', { count: todayCount }) : t('today.statusClear'),
    nextSpecial ? `${nextSpecial.item.title}: ${statusLabel(t, nextSpecial.status)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const inboxNote = inbox.data.length ? t('today.inInbox', { count: inbox.data.length }) : null;
  const invite = inviteState(space, members.length, now);

  const hour = now.getHours();
  const greeting = t(
    hour < 12
      ? 'today.greetingMorning'
      : hour < 18
        ? 'today.greetingAfternoon'
        : 'today.greetingEvening',
  );
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const partner = members.find((m) => m.userId !== user?.id);
  const theirDay = partner
    ? partnerDay({
        tasks: tasks.data,
        externalEvents: externalEvents.data,
        externalCalendars: externalCalendars.data,
        userId: user?.id ?? '',
        partnerId: partner.userId,
        now,
      })
    : null;
  const theirSummary = theirDay
    ? [
        theirDay.tasks.length > 0
          ? t('today.partnerTasks', { count: theirDay.tasks.length })
          : null,
        theirDay.eventsToday > 0 ? t('today.partnerEvents', { count: theirDay.eventsToday }) : null,
      ]
        .filter(Boolean)
        .join(' · ') || t('today.partnerClear')
    : '';
  const inkMuted = useColor('ink-muted');
  const myName = user?.displayName || user?.email || '?';

  const groceryListIds = new Set(
    lists.data.filter((l) => l.category === 'groceries').map((l) => l.id),
  );
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
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
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
            title: externalEventTitle(entry.event, {
              busy: t('calendar.busy'),
              untitled: t('calendar.untitled'),
            }),
            when: `${format.dayLabel(entry.day, now)} · ${
              entry.isAllDay
                ? t('format.allDay')
                : `${formatTime(entry.startAt!)}–${formatTime(entry.endAt!)}`
            }`,
            pill: (
              <Pill label={entry.mine ? t('calendar.mine') : partnerName(entry.event.userId)} />
            ),
            muted: entry.event.redacted,
          }
        : null;

  return (
    <ScreenScaffold
      title={t('today.title')}
      footer={
        <View className="px-4 pt-2 pb-3 bg-bg">
          {(captureNote ?? inboxNote) ? (
            <Text className="text-sm text-ink-muted px-2 mb-2">{captureNote ?? inboxNote}</Text>
          ) : null}
          {/* Quick capture: text only for now; saved locally first, synced when possible */}
          <View className="bg-surface rounded-full border border-border pl-3 pr-2 flex-row items-center min-h-[48px]">
            <View className="w-6 h-6 rounded-full bg-action items-center justify-center mr-2">
              <Icon name="plus" size={sizes['icon-sm']} color={onAction} />
            </View>
            <TextField
              value={captureText}
              onChangeText={(text: string) => {
                setCaptureText(text);
                setCaptureNote(null);
              }}
              onSubmitEditing={handleCapture}
              placeholder={t('today.capturePlaceholder')}
              returnKeyType="done"
              maxLength={5000}
              className="flex-1 text-ink text-sm py-1"
              style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 }}
            />
            {captureText.trim() ? (
              <Button
                label={saving ? '…' : t('common.save')}
                small
                onPress={handleCapture}
                disabled={saving}
              />
            ) : null}
          </View>
        </View>
      }
      header={
        <View className="flex-1">
          <Text className="text-sm leading-5 text-ink-muted mb-2">{format.longDate(now)}</Text>
          <Pressable
            onPress={() => setProfileOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('today.openProfile')}
            className="flex-row items-center min-h-[48px] active:opacity-70"
          >
            <AvatarPair people={[myName, partner ? partner.displayName : null]} size={40} />
            <View className="flex-1 ml-3">
              <Text className="text-title-3 font-bold text-ink" numberOfLines={1}>
                {firstName ? `${greeting}, ${firstName}` : greeting}
              </Text>
              <Text className="text-sm leading-5 text-ink-muted" numberOfLines={1}>
                {statusLine}
              </Text>
            </View>
          </Pressable>
        </View>
      }
    >
      {/* Setup card: only while there is a next step to take, and gone once it is done. */}
      {invite.kind !== 'none' ? (
        <Card>
          <SectionLabel>{t('today.setupLabel')}</SectionLabel>
          <View className="flex-row items-center">
            <View className="flex-1 mr-3">
              <Text className="text-base font-semibold text-ink">
                {t('today.invitePartnerTitle')}
              </Text>
              <Text className="text-sm text-ink-muted mt-0.5">
                {invite.kind === 'valid' && invite.expiresAt
                  ? t('today.inviteValidUntil', { date: invite.expiresAt.toLocaleDateString() })
                  : invite.kind === 'valid'
                    ? t('today.inviteReady')
                    : t('profile.inviteExpired')}
              </Text>
            </View>
            <Button
              small
              label={invite.kind === 'valid' ? t('profile.inviteShare') : t('profile.inviteNew')}
              onPress={() =>
                invite.kind === 'valid'
                  ? Share.share({ message: t('profile.inviteShareMessage', { code: invite.code }) })
                  : setProfileOpen(true)
              }
            />
          </View>
        </Card>
      ) : null}

      {needsAttention.length > 0 ? (
        <Card className="border-border-strong">
          <SectionLabel>{t('today.needsAttention')}</SectionLabel>
          {needsAttention.slice(0, TODAY_TASK_LIMIT).map((task, index) => (
            <View key={task.id}>
              {index > 0 ? <View className="h-px bg-border my-3" /> : null}
              <View className="flex-row items-center">
                <Checkbox
                  checked={false}
                  onToggle={() => toggleTask(task)}
                  label={t('today.complete', { title: task.title })}
                />
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-medium text-ink" numberOfLines={1}>
                    {task.title}
                  </Text>
                  {isOverdue(task) ? (
                    <Text className="text-xs text-ink-muted">
                      {t('today.overdue')} ·{' '}
                      {t('household.due', { day: format.dayLabel(new Date(task.dueDate!), now) })}
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
            <Text className="text-sm text-ink-muted mt-3">
              {t('today.more', { count: needsAttention.length - TODAY_TASK_LIMIT })}
            </Text>
          ) : null}
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
                  <Text
                    className={`text-base font-semibold ${row.muted ? 'text-ink-muted' : 'text-ink'}`}
                    numberOfLines={1}
                  >
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

      {/* Us: the running count for the featured day, and the next special day. Opens the Us tab. */}
      {strip.featured || strip.next ? (
        <Pressable
          onPress={() => navigation.navigate('Dates')}
          accessibilityRole="button"
          accessibilityLabel={t('today.openUs')}
          className="active:opacity-70"
        >
          <Card>
            <View className="flex-row items-center">
              {strip.featured ? (
                <View className="flex-1">
                  <Text
                    className="text-xs leading-4 font-semibold text-ink-muted tracking-wider uppercase"
                    numberOfLines={1}
                  >
                    {strip.featured.item.title}
                  </Text>
                  <Text className="text-title-3 font-bold text-ink mt-1" numberOfLines={1}>
                    {strip.featured.days !== null
                      ? t('common.day', { count: strip.featured.days })
                      : statusLabel(t, strip.featured.status)}
                  </Text>
                </View>
              ) : null}
              {strip.featured && strip.next ? (
                <View className="w-px self-stretch bg-border mx-4" />
              ) : null}
              {strip.next ? (
                <View className="flex-1">
                  <Text
                    className="text-xs leading-4 font-semibold text-ink-muted tracking-wider uppercase"
                    numberOfLines={1}
                  >
                    {strip.next.item.title}
                  </Text>
                  <Text className="text-title-3 font-bold text-ink mt-1" numberOfLines={1}>
                    {statusLabel(t, strip.next.status)}
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        </Pressable>
      ) : null}

      {/* The partner's day, read-only. Only once they have joined. */}
      {partner && theirDay ? (
        <Pressable
          onPress={() => setPartnerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('today.openPartnerDay', {
            name: partner.displayName.split(' ')[0],
          })}
          className="active:opacity-70"
        >
          <Card>
            <View className="flex-row items-center">
              <View className="w-10 h-10 rounded-full bg-brand-mint items-center justify-center mr-3">
                <Text className="text-base font-semibold text-brand-deep">
                  {userInitial(partner.displayName)}
                </Text>
              </View>
              <View className="flex-1 mr-2">
                <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                  {partner.displayName.split(' ')[0]}
                </Text>
                <Text className="text-sm text-ink-muted mt-0.5" numberOfLines={1}>
                  {theirSummary}
                </Text>
              </View>
              <Icon name="chevron-right" size={sizes['icon-sm']} color={inkMuted} />
            </View>
          </Card>
        </Pressable>
      ) : null}

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
                    <Text
                      className={`text-base font-semibold ${row.muted ? 'text-ink-muted' : 'text-ink'}`}
                      numberOfLines={1}
                    >
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
        <SectionLabel>{t('today.tasksDueSoon')}</SectionLabel>
        {openTasks.length === 0 ? <EmptyState message={t('today.noOpenTasks')} /> : null}
        {openTasks.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center">
              <Checkbox
                checked={false}
                onToggle={() => toggleTask(task)}
                label={t('today.complete', { title: task.title })}
              />
              <Text className="flex-1 text-sm font-medium text-ink mr-2" numberOfLines={1}>
                {task.title}
              </Text>
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
              <View
                key={item.id}
                className="bg-surface-sunken border border-border px-3 py-1.5 rounded-full"
              >
                <Text className="text-base font-medium text-ink">{item.name}</Text>
              </View>
            ))}
            {openGroceries.length > 4 ? (
              <View className="bg-bg border border-border px-3 py-1.5 rounded-full">
                <Text className="text-sm text-ink-muted">
                  {t('today.more', { count: openGroceries.length - 4 })}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </Card>
      <ProfileScreen visible={profileOpen} onClose={() => setProfileOpen(false)} />
      {partner && theirDay ? (
        <PartnerDayScreen
          visible={partnerOpen}
          onClose={() => setPartnerOpen(false)}
          name={partner.displayName}
          day={theirDay}
          now={now}
        />
      ) : null}
    </ScreenScaffold>
  );
};
