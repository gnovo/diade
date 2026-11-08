import { externalEventTitle, formatTime, isSameLocalDay } from '@diade/domain';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { dayKey } from '../calendar/monthGrid';
import {
  layoutBlocks,
  MIN_BLOCK_MINUTES,
  minutesIntoDay,
  type TimedBlock,
} from '../calendar/timeGrid';
import type { AgendaEntry } from '../data/unifiedAgenda';
import { Icon, useColor } from '../design';
import type { AgendaRowHandlers } from './AgendaRow';

const HOUR_HEIGHT = 56;
const HOUR_COLUMN = 44;
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const SWIPE_DISTANCE = 56;
const WEEK_ALL_DAY_MAX = 2;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** "#RRGGBB" with an alpha, for a tinted block that works on a light and a dark background. */
function tint(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return `${color}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

type EventEntry = Extract<AgendaEntry, { kind: 'external' | 'event' }>;

function timesOf(entry: AgendaEntry): { start: Date; end: Date } | null {
  if (entry.kind === 'external' && !entry.isAllDay && entry.startAt && entry.endAt) {
    return { start: entry.startAt, end: entry.endAt };
  }
  if (entry.kind === 'event' && !entry.item.isAllDay)
    return { start: entry.item.startAt, end: entry.item.endAt };
  return null;
}

/**
 * Day and week views: an hour grid with events as blocks (overlapping ones side by side), an
 * all-day strip above it for all-day events, tasks and important dates, and a line for now.
 * Swiping sideways moves a day or a week.
 */
export const TimeGrid: React.FC<
  {
    days: Date[];
    entriesByDay: Map<string, AgendaEntry[]>;
    now: Date;
    onSwipe: (delta: -1 | 1) => void;
    onOpenDay?: (day: Date) => void;
  } & Pick<AgendaRowHandlers, 'onOpenEvent' | 'onOpenExternal'>
> = ({ days, entriesByDay, now, onSwipe, onOpenDay, onOpenEvent, onOpenExternal }) => {
  const { t } = useTranslation();
  const week = days.length > 1;
  const palette = {
    event: useColor('action'),
    task: useColor('ink-muted'),
    date: useColor('warning'),
    neutral: useColor('border-strong'),
  };
  const nowLine = useColor('danger');

  const [clock, setClock] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const swipe = useRef(onSwipe);
  swipe.current = onSwipe;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_DISTANCE) swipe.current(1);
        else if (g.dx >= SWIPE_DISTANCE) swipe.current(-1);
      },
    }),
  ).current;

  const todayShown = days.some((d) => isSameLocalDay(d, clock));
  // Open on the working day: an hour before now when today is on screen, otherwise 08:00.
  const initialY = useRef(
    Math.max(0, ((todayShown ? minutesIntoDay(clock, clock) : 8 * 60) - 60) / 60) * HOUR_HEIGHT,
  ).current;

  const colorOf = (entry: AgendaEntry): string => {
    if (entry.kind === 'external') return entry.calendar?.color ?? palette.neutral;
    if (entry.kind === 'event') return palette.event;
    if (entry.kind === 'task') return palette.task;
    return palette.date;
  };
  const titleOf = (entry: AgendaEntry): string => {
    switch (entry.kind) {
      case 'external':
        return externalEventTitle(entry.event, {
          busy: t('calendar.busy'),
          untitled: t('calendar.untitled'),
        });
      case 'event':
        return entry.item.title;
      case 'task':
        return entry.task.title;
      case 'important_date':
        return entry.item.title;
    }
  };
  const open = (entry: AgendaEntry) => {
    if (entry.kind === 'external') onOpenExternal(entry);
    else if (entry.kind === 'event') onOpenEvent(entry.item.eventId);
  };

  const columns = useMemo(
    () =>
      days.map((day) => {
        const entries = entriesByDay.get(dayKey(day)) ?? [];
        const byId = new Map<string, EventEntry>();
        const blocks: TimedBlock[] = [];
        const allDay: AgendaEntry[] = [];
        for (const entry of entries) {
          const times = timesOf(entry);
          if (times) {
            byId.set(entry.key, entry as EventEntry);
            blocks.push({
              id: entry.key,
              startMin: minutesIntoDay(times.start, day),
              endMin: minutesIntoDay(times.end, day),
            });
          } else if (entry.kind === 'task' && entry.task.status === 'completed') {
          } else {
            allDay.push(entry);
          }
        }
        return { day, placed: layoutBlocks(blocks), byId, allDay };
      }),
    [days, entriesByDay],
  );
  const hasAllDay = columns.some((c) => c.allDay.length > 0);

  return (
    <View className="flex-1" {...pan.panHandlers}>
      {/* Day headers stay put while the hours scroll. */}
      <View className="flex-row px-4 pb-2">
        <View style={{ width: HOUR_COLUMN }} />
        {days.map((day) => {
          const isToday = isSameLocalDay(day, clock);
          const Cell = week && onOpenDay ? Pressable : View;
          return (
            <Cell
              key={dayKey(day)}
              {...(week && onOpenDay
                ? {
                    onPress: () => onOpenDay(day),
                    accessibilityRole: 'button' as const,
                    accessibilityLabel: dayKey(day),
                  }
                : {})}
              className="flex-1 items-center"
            >
              <Text className="text-xs font-semibold text-ink-muted uppercase">
                {t(`format.weekdayShort.${WEEKDAY_KEYS[day.getDay()]}`)}
              </Text>
              <View
                className={`w-8 h-8 mt-0.5 rounded-full items-center justify-center ${isToday ? 'bg-action' : ''}`}
              >
                <Text
                  className={`text-base ${isToday ? 'text-on-action font-bold' : 'text-ink font-medium'}`}
                >
                  {day.getDate()}
                </Text>
              </View>
            </Cell>
          );
        })}
      </View>

      {hasAllDay ? (
        <View className="flex-row px-4 pb-2 border-b border-border">
          <View style={{ width: HOUR_COLUMN }} className="justify-start pt-1">
            <Text className="text-[10px] leading-3 text-ink-muted">{t('format.allDay')}</Text>
          </View>
          {columns.map(({ day, allDay }) => {
            const shown = week ? allDay.slice(0, WEEK_ALL_DAY_MAX) : allDay;
            const hidden = allDay.length - shown.length;
            return (
              <View key={dayKey(day)} className="flex-1" style={{ paddingHorizontal: 1, gap: 2 }}>
                {shown.map((entry) => {
                  const color = colorOf(entry);
                  const pressable = entry.kind === 'external' || entry.kind === 'event';
                  return (
                    <Pressable
                      key={entry.key}
                      disabled={!pressable}
                      onPress={() => open(entry)}
                      accessibilityRole={pressable ? 'button' : 'text'}
                      accessibilityLabel={`${titleOf(entry)}, ${t('format.allDay')}`}
                      style={{ backgroundColor: tint(color, 0.28) }}
                      className="flex-row items-center rounded-md px-1 py-0.5"
                    >
                      {entry.kind === 'task' ? <Icon name="square-check" size={11} /> : null}
                      <Text
                        className="flex-1 text-[11px] leading-[14px] text-ink font-medium"
                        numberOfLines={1}
                      >
                        {titleOf(entry)}
                      </Text>
                    </Pressable>
                  );
                })}
                {hidden > 0 ? (
                  <Text className="text-[10px] text-ink-muted text-center">+{hidden}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : (
        <View className="border-b border-border" />
      )}

      <ScrollView contentOffset={{ x: 0, y: initialY }} showsVerticalScrollIndicator={false}>
        <View style={{ height: HOUR_HEIGHT * 24 }} className="flex-row px-4">
          {/* Hour labels and hairlines */}
          <View style={{ width: HOUR_COLUMN }} importantForAccessibility="no-hide-descendants">
            {HOURS.map((h) => (
              <View key={h} style={{ height: HOUR_HEIGHT }}>
                {h > 0 ? (
                  <Text className="text-[10px] leading-3 text-ink-muted" style={{ marginTop: -6 }}>
                    {`${String(h).padStart(2, '0')}:00`}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
          <View className="flex-1 flex-row">
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            >
              {HOURS.map((h) => (
                <View key={h} style={{ height: HOUR_HEIGHT }} className="border-t border-border" />
              ))}
            </View>
            {columns.map(({ day, placed, byId }) => {
              const isToday = isSameLocalDay(day, clock);
              return (
                <View key={dayKey(day)} className="flex-1 border-l border-border">
                  {placed.map((block) => {
                    const entry = byId.get(block.id)!;
                    const color = colorOf(entry);
                    const mine = entry.kind !== 'external' || entry.mine;
                    const times = timesOf(entry)!;
                    const height =
                      Math.max(block.endMin - block.startMin, MIN_BLOCK_MINUTES) *
                      (HOUR_HEIGHT / 60);
                    const label = titleOf(entry);
                    return (
                      <Pressable
                        key={block.id}
                        onPress={() => open(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={`${label}, ${formatTime(times.start)}–${formatTime(times.end)}`}
                        style={{
                          position: 'absolute',
                          top: (block.startMin * HOUR_HEIGHT) / 60 + 1,
                          height: height - 2,
                          left: `${(block.column / block.columns) * 100}%`,
                          width: `${100 / block.columns}%`,
                          paddingHorizontal: 1,
                        }}
                      >
                        <View
                          style={{
                            flex: 1,
                            backgroundColor: tint(color, mine ? 0.3 : 0.16),
                            borderLeftWidth: 3,
                            borderLeftColor: color,
                            borderWidth: mine ? 0 : 1,
                            borderColor: color,
                            borderRadius: 6,
                            paddingHorizontal: week ? 3 : 6,
                            paddingVertical: 2,
                            overflow: 'hidden',
                          }}
                        >
                          <Text
                            className={`font-semibold text-ink ${week ? 'text-[10px] leading-3' : 'text-xs leading-4'}`}
                            numberOfLines={week ? 2 : 1}
                          >
                            {label}
                          </Text>
                          {!week && height >= 44 ? (
                            <Text
                              className="text-[10px] leading-3 text-ink-muted"
                              numberOfLines={1}
                            >
                              {formatTime(times.start)}–{formatTime(times.end)}
                            </Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                  {isToday ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: (minutesIntoDay(clock, clock) * HOUR_HEIGHT) / 60 - 1,
                        height: 2,
                        backgroundColor: nowLine,
                      }}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          left: -4,
                          top: -3,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: nowLine,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
};
