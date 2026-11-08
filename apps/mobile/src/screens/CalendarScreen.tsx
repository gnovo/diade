import { space } from '@diade/design-tokens';
import {
  addLocalDays,
  type CalendarEvent,
  type ExternalCalendar,
  type ExternalEvent,
  type ImportantDate,
  isSameLocalDay,
  isThirdPartyDate,
  startOfLocalDay,
  type Task,
} from '@diade/domain';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  type ScrollViewInstance,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  dayKey,
  firstOfMonth,
  isSameMonth,
  monthGridStart,
  shiftMonth,
} from '../calendar/monthGrid';
import { CALENDAR_VIEWS, type CalendarView, useCalendarPrefs } from '../calendar/prefs';
import { weekDays } from '../calendar/timeGrid';
import { useNeedsCalendarSetup } from '../calendar/useCalendarSetup';
import { AgendaRow } from '../components/AgendaRow';
import { CalendarFiltersSheet, hasActiveFilters } from '../components/CalendarFiltersSheet';
import { CalendarHeader } from '../components/CalendarHeader';
import { EventForm } from '../components/EventForm';
import { ExternalEventDetail } from '../components/ExternalEventDetail';
import { MonthView } from '../components/MonthView';
import { TimeGrid } from '../components/TimeGrid';
import { Button, Card, EmptyState } from '../components/ui';
import { ViewTransition } from '../components/ViewTransition';
import { useAuth } from '../context/AuthContext';
import {
  getActiveEvents,
  getActiveImportantDates,
  getActiveTasks,
  getExternalCalendars,
  getExternalEvents,
} from '../data/queries';
import { updateRecord } from '../data/repository';
import { type AgendaEntry, buildUnifiedAgenda, type GoogleScope } from '../data/unifiedAgenda';
import { useLiveQuery } from '../data/useLiveQuery';
import { useFormat } from '../i18n';
import { CalendarSettingsScreen } from './CalendarSettingsScreen';

const AGENDA_DAYS = 60;
const SCROLLED_PX = 240; // past this, "today" is worth offering in the schedule
// Agenda shows this many days at once, then fills in the rest in chunks. Mounting all 60 days
// in one go made the switch to Agenda take about three times as long as any other view.
const AGENDA_FIRST_CHUNK = 5;
const AGENDA_CHUNK = 8;

export const CalendarScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const { user, members } = useAuth();
  const events = useLiveQuery(getActiveEvents, [] as CalendarEvent[]);
  const externalEvents = useLiveQuery(getExternalEvents, [] as ExternalEvent[]);
  const externalCalendars = useLiveQuery(getExternalCalendars, [] as ExternalCalendar[]);
  const tasks = useLiveQuery(getActiveTasks, [] as Task[]);
  const specialDates = useLiveQuery(getActiveImportantDates, [] as ImportantDate[]);
  const prefs = useCalendarPrefs();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<Extract<AgendaEntry, { kind: 'external' }> | null>(null);

  const now = new Date();
  const today = startOfLocalDay(now);
  const userId = user?.id ?? '';

  // Month view: the month on show and the day picked in it. Schedule: the month at the top of the screen.
  const [month, setMonth] = useState(() => firstOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfLocalDay(new Date()));
  const [scheduleMonth, setScheduleMonth] = useState(() => firstOfMonth(new Date()));
  const [scrolled, setScrolled] = useState(false);
  const [agendaShown, setAgendaShown] = useState(AGENDA_FIRST_CHUNK);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const groupY = useRef(new Map<string, number>());

  const agendaInput = {
    events: events.data,
    externalEvents: externalEvents.data,
    externalCalendars: externalCalendars.data,
    tasks: tasks.data,
    importantDates: specialDates.data,
    userId,
    googleScope: prefs.googleScope,
    showOthersDates: prefs.showOthersDates,
    hiddenCalendarIds: prefs.hiddenCalendarIds,
  };

  const agenda = useMemo(
    () => buildUnifiedAgenda({ ...agendaInput, from: today, to: addLocalDays(today, AGENDA_DAYS) }),
    // `today` changes only at midnight; the data and the filters are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      events.data,
      externalEvents.data,
      externalCalendars.data,
      tasks.data,
      specialDates.data,
      userId,
      prefs.googleScope,
      prefs.showOthersDates,
      prefs.hiddenCalendarIds,
      today.getTime(),
    ],
  );

  const isMonth = prefs.view === 'month';
  const isTime = prefs.view === 'day' || prefs.view === 'week';
  const timeDays = useMemo(
    () => (prefs.view === 'week' ? weekDays(selectedDay) : [selectedDay]),
    [prefs.view, selectedDay],
  );

  // What the month grid or the day/week columns need, by day. Schedule builds its own list above.
  const entriesByDay = useMemo(() => {
    const map = new Map<string, AgendaEntry[]>();
    let from: Date;
    let days: number;
    if (isMonth) {
      from = monthGridStart(month);
      days = 42;
    } else if (isTime) {
      from = timeDays[0]!;
      days = timeDays.length;
    } else {
      return map;
    }
    const built = buildUnifiedAgenda({ ...agendaInput, from, to: addLocalDays(from, days), today });
    for (const group of built.days) map.set(dayKey(group.day), group.entries);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    prefs.view,
    month,
    timeDays,
    events.data,
    externalEvents.data,
    externalCalendars.data,
    tasks.data,
    specialDates.data,
    userId,
    prefs.googleScope,
    prefs.showOthersDates,
    prefs.hiddenCalendarIds,
    today.getTime(),
  ]);

  const partnerFirstName =
    members.find((m) => m.userId !== userId)?.displayName.split(' ')[0] ?? t('common.partner');
  const partnerName = (id: string | null) => {
    if (id === null) return t('common.both');
    if (id === userId) return t('common.me');
    return partnerFirstName;
  };

  const openEvent = (eventId: string) => {
    setEditing(events.data.find((e) => e.id === eventId) ?? null);
    setFormOpen(true);
  };

  const toggleTask = (task: Task) => {
    const completing = task.status !== 'completed';
    return updateRecord('tasks', task.id, {
      status: completing ? 'completed' : 'todo',
      completedAt: completing ? new Date().toISOString() : null,
    });
  };

  const connected = externalCalendars.data.length > 0;
  const needsSetup = useNeedsCalendarSetup(connected, settingsOpen);
  const filtersActive = hasActiveFilters(
    prefs.googleScope,
    prefs.hiddenCalendarIds,
    externalCalendars.data,
    prefs.showOthersDates,
  );

  const scopeOptions: Array<{ value: GoogleScope; label: string }> = [
    { value: 'both', label: t('calendar.scopeBoth') },
    { value: 'me', label: t('common.me') },
    { value: 'partner', label: partnerFirstName },
  ];

  // Bring the rest of the agenda in after the transition has had its frames, a chunk at a time.
  useEffect(() => {
    if (prefs.view !== 'schedule') {
      setAgendaShown(AGENDA_FIRST_CHUNK);
      return undefined;
    }
    if (agendaShown >= agenda.days.length) return undefined;
    const timer = setTimeout(
      () => setAgendaShown((n) => n + AGENDA_CHUNK),
      agendaShown === AGENDA_FIRST_CHUNK ? 380 : 50,
    );
    return () => clearTimeout(timer);
  }, [prefs.view, agendaShown, agenda.days.length]);

  const empty = agenda.days.length === 0 && agenda.overdue.length === 0;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setScrolled(y > SCROLLED_PX);
    // The title follows the day at the top of the screen, like Android's schedule view.
    let top: Date | null = null;
    for (const group of agenda.days) {
      const offset = groupY.current.get(dayKey(group.day));
      if (offset !== undefined && offset <= y + 8) top = group.day;
    }
    const next = firstOfMonth(top ?? now);
    setScheduleMonth((current) => (isSameMonth(current, next) ? current : next));
  };

  // Which way new content slides in from, for the transition: set just before the state that causes it.
  const direction = useRef<-1 | 0 | 1>(0);

  const goToday = () => {
    direction.current = 0;
    if (isMonth) {
      setMonth(firstOfMonth(now));
      setSelectedDay(today);
    } else if (isTime) {
      setSelectedDay(today);
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  /** Previous or next month, week or day, depending on the view. */
  const shift = (delta: -1 | 1) => {
    direction.current = delta;
    if (prefs.view === 'week') {
      setSelectedDay(addLocalDays(selectedDay, 7 * delta));
    } else if (prefs.view === 'day') {
      setSelectedDay(addLocalDays(selectedDay, delta));
    } else {
      const next = shiftMonth(month, delta);
      setMonth(next);
      setSelectedDay(isSameMonth(next, now) ? today : next);
    }
  };

  const changeView = (next: CalendarView) => {
    const step = CALENDAR_VIEWS.indexOf(next) - CALENDAR_VIEWS.indexOf(prefs.view);
    direction.current = step === 0 ? 0 : step > 0 ? 1 : -1;
    if (next === 'month') setMonth(firstOfMonth(selectedDay));
    prefs.setView(next);
  };

  const showToday =
    prefs.view === 'month'
      ? !isSameMonth(month, now) || !isSameLocalDay(selectedDay, now)
      : prefs.view === 'schedule'
        ? scrolled
        : !timeDays.some((d) => isSameLocalDay(d, now));

  const navLabels: Record<CalendarView, [string, string]> = {
    schedule: ['', ''],
    day: [t('calendar.prevDay'), t('calendar.nextDay')],
    week: [t('calendar.prevWeek'), t('calendar.nextWeek')],
    month: [t('calendar.prevMonth'), t('calendar.nextMonth')],
  };
  const titleDate =
    prefs.view === 'month'
      ? month
      : prefs.view === 'schedule'
        ? scheduleMonth
        : timeDays[Math.min(3, timeDays.length - 1)]!;
  const periodKey =
    prefs.view === 'schedule' ? '' : dayKey(prefs.view === 'month' ? month : timeDays[0]!);

  const topBlock = () => (
    <>
      {!connected ? (
        <Card>
          <Text className="text-base font-semibold text-ink mb-1">
            {t('googleCalendar.introTitle')}
          </Text>
          <Text className="text-sm leading-5 text-ink-muted mb-3">
            {t('googleCalendar.manageNote')}
          </Text>
          <Button
            label={t('googleCalendar.open')}
            variant="ghost"
            onPress={() => setSettingsOpen(true)}
          />
        </Card>
      ) : needsSetup ? (
        <Card>
          <Text className="text-base font-semibold text-ink mb-1">{t('calendar.setupTitle')}</Text>
          <Text className="text-sm leading-5 text-ink-muted mb-3">{t('calendar.setupBody')}</Text>
          <Button label={t('calendar.setupAction')} onPress={() => setSettingsOpen(true)} />
        </Card>
      ) : null}
    </>
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <CalendarHeader
        title={format.monthYear(titleDate)}
        view={prefs.view}
        onViewChange={changeView}
        showNav={prefs.view !== 'schedule'}
        prevLabel={navLabels[prefs.view][0]}
        nextLabel={navLabels[prefs.view][1]}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        showToday={showToday}
        onToday={goToday}
        showFilters={
          (connected && !needsSetup) || specialDates.data.some((d) => isThirdPartyDate(d.type))
        }
        filtersActive={filtersActive}
        onOpenFilters={() => setFiltersOpen(true)}
      />
      <ViewTransition
        transitionKey={`${prefs.view}:${periodKey}`}
        direction={direction.current}
        style={{ flex: 1 }}
      >
        {isTime ? (
          <View className="flex-1">
            <View className="px-4 pt-1">{topBlock()}</View>
            <TimeGrid
              days={timeDays}
              entriesByDay={entriesByDay}
              now={now}
              onSwipe={shift}
              onOpenDay={(day) => {
                setSelectedDay(day);
                changeView('day');
              }}
              onOpenEvent={openEvent}
              onOpenExternal={setDetail}
            />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            onScroll={isMonth ? undefined : onScroll}
            scrollEventThrottle={32}
            contentContainerStyle={{
              paddingHorizontal: space[4],
              paddingTop: space[2],
              paddingBottom: space[8],
            }}
            keyboardShouldPersistTaps="handled"
          >
            {topBlock()}

            {isMonth ? (
              <MonthView
                month={month}
                selectedDay={selectedDay}
                now={now}
                entriesByDay={entriesByDay}
                onSelectDay={(day) => {
                  setSelectedDay(day);
                  if (!isSameMonth(day, month)) setMonth(firstOfMonth(day));
                }}
                onShiftMonth={shift}
                onOpenEvent={openEvent}
                onOpenExternal={setDetail}
                onToggleTask={toggleTask}
                partnerName={partnerName}
              />
            ) : (
              <>
                {agenda.overdue.length > 0 ? (
                  <View className="mb-5">
                    <Text className="text-sm font-bold text-ink uppercase tracking-wider mb-2">
                      {t('calendar.overdue')}
                    </Text>
                    <View className="bg-surface rounded-2xl border border-border-strong overflow-hidden">
                      {agenda.overdue.map((task, index) => (
                        <View key={task.id} className={index > 0 ? 'border-t border-border' : ''}>
                          <AgendaRow
                            entry={{
                              kind: 'task',
                              key: `overdue:${task.id}`,
                              day: startOfLocalDay(new Date(task.dueDate!)),
                              task,
                            }}
                            now={now}
                            onOpenEvent={openEvent}
                            onOpenExternal={setDetail}
                            onToggleTask={toggleTask}
                            partnerName={partnerName}
                          />
                          <Text className="px-4 pb-2 -mt-2 text-xs text-ink-muted">
                            {t('household.due', {
                              day: format.dayLabel(new Date(task.dueDate!), now),
                            })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {empty ? (
                  <Card>
                    <EmptyState message={t('calendar.empty')} />
                  </Card>
                ) : null}

                {agenda.days.slice(0, agendaShown).map((group) => (
                  <View
                    key={group.day.toISOString()}
                    className="mb-5"
                    onLayout={(e) => groupY.current.set(dayKey(group.day), e.nativeEvent.layout.y)}
                  >
                    <Text className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-2">
                      {format.dayLabel(group.day, now)}
                    </Text>
                    <View className="bg-surface rounded-2xl border border-border overflow-hidden">
                      {group.entries.map((entry, index) => (
                        <View key={entry.key} className={index > 0 ? 'border-t border-border' : ''}>
                          <AgendaRow
                            entry={entry}
                            now={now}
                            onOpenEvent={openEvent}
                            onOpenExternal={setDetail}
                            onToggleTask={toggleTask}
                            partnerName={partnerName}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </ViewTransition>

      <EventForm
        visible={formOpen}
        event={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <ExternalEventDetail entry={detail} onClose={() => setDetail(null)} />
      <CalendarFiltersSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        scope={prefs.googleScope}
        onScopeChange={prefs.setGoogleScope}
        scopeOptions={scopeOptions}
        calendars={externalCalendars.data}
        hiddenIds={prefs.hiddenCalendarIds}
        onToggleCalendar={prefs.toggleCalendar}
        showOthersDates={prefs.showOthersDates}
        onShowOthersDatesChange={prefs.setShowOthersDates}
        userId={userId}
        partnerName={partnerFirstName}
        onManage={() => setSettingsOpen(true)}
      />
      <CalendarSettingsScreen visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </SafeAreaView>
  );
};
