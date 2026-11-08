import { isSameLocalDay } from '@diade/domain';
import type React from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { dayKey, dayMarkers, isSameMonth, monthGridDays } from '../calendar/monthGrid';
import type { AgendaEntry } from '../data/unifiedAgenda';
import { useColor } from '../design';
import { useFormat } from '../i18n';
import { AgendaRow, type AgendaRowHandlers } from './AgendaRow';

const WEEK_STARTS_ON = 1; // Monday
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const SWIPE_DISTANCE = 56;

/**
 * Month grid with a dot per calendar under each day, and the selected day's agenda below it,
 * like Android's Calendar. Swiping the grid sideways moves between months.
 */
export const MonthView: React.FC<
  {
    month: Date;
    selectedDay: Date;
    now: Date;
    entriesByDay: Map<string, AgendaEntry[]>;
    onSelectDay: (day: Date) => void;
    onShiftMonth: (delta: -1 | 1) => void;
  } & AgendaRowHandlers
> = ({ month, selectedDay, now, entriesByDay, onSelectDay, onShiftMonth, ...handlers }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const palette = {
    event: useColor('action'),
    task: useColor('ink-muted'),
    date: useColor('warning'),
    neutral: useColor('border-strong'),
  };

  // The pan responder is created once, so it reads the latest callback through a ref.
  const shift = useRef(onShiftMonth);
  shift.current = onShiftMonth;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_DISTANCE) shift.current(1);
        else if (g.dx >= SWIPE_DISTANCE) shift.current(-1);
      },
    }),
  ).current;

  const days = monthGridDays(month, WEEK_STARTS_ON);
  const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const weekdayLabels = Array.from(
    { length: 7 },
    (_, i) => WEEKDAY_KEYS[(WEEK_STARTS_ON + i) % 7]!,
  );
  const selectedEntries = entriesByDay.get(dayKey(selectedDay)) ?? [];

  return (
    <View>
      <View {...pan.panHandlers} className="mb-5">
        <View
          className="flex-row mb-1"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {weekdayLabels.map((key) => (
            <Text
              key={key}
              className="flex-1 text-center text-xs font-semibold text-ink-muted uppercase"
            >
              {t(`format.weekdayShort.${key}`)}
            </Text>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={dayKey(week[0]!)} className="flex-row">
            {week.map((day) => {
              const inMonth = isSameMonth(day, month);
              const today = isSameLocalDay(day, now);
              const selected = isSameLocalDay(day, selectedDay);
              const entries = entriesByDay.get(dayKey(day)) ?? [];
              const markers = dayMarkers(entries, palette);
              return (
                <Pressable
                  key={dayKey(day)}
                  onPress={() => onSelectDay(day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${format.longDate(day)}${entries.length ? `, ${t('calendar.itemCount', { count: entries.length })}` : ''}`}
                  className={`flex-1 items-center pt-1.5 pb-1 min-h-[56px] rounded-xl ${selected ? 'bg-surface-sunken' : ''}`}
                >
                  <View
                    className={`w-8 h-8 rounded-full items-center justify-center ${today ? 'bg-action' : ''}`}
                  >
                    <Text
                      className={`text-sm ${
                        today
                          ? 'text-on-action font-bold'
                          : inMonth
                            ? 'text-ink font-medium'
                            : 'text-ink-muted opacity-50'
                      }`}
                    >
                      {day.getDate()}
                    </Text>
                  </View>
                  <View
                    className="flex-row items-center h-2 mt-1"
                    style={{ gap: 3, opacity: inMonth ? 1 : 0.5 }}
                  >
                    {markers.colors.map((color) => (
                      <View
                        key={color}
                        style={{ backgroundColor: color }}
                        className="w-1.5 h-1.5 rounded-full"
                      />
                    ))}
                    {markers.extra > 0 ? (
                      <Text className="text-[9px] leading-[9px] text-ink-muted">+</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <Text className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-2">
        {format.dayLabel(selectedDay, now)}
      </Text>
      {selectedEntries.length === 0 ? (
        <Text className="text-sm text-ink-muted px-1">{t('calendar.nothingThisDay')}</Text>
      ) : (
        <View className="bg-surface rounded-2xl border border-border overflow-hidden">
          {selectedEntries.map((entry, index) => (
            <View key={entry.key} className={index > 0 ? 'border-t border-border' : ''}>
              <AgendaRow entry={entry} now={now} {...handlers} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
};
