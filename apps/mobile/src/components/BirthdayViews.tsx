import type { BirthdayEntry, ImportantDate } from '@diade/domain';
import type { TFunction } from '@diade/i18n';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { statusLabel } from '../data/importantDateDisplay';
import { useFormat } from '../i18n';
import { ImportantDateIcon } from './ImportantDateIcon';
import { Card } from './ui';

type Birthday = BirthdayEntry<ImportantDate>;

const countdown = (t: TFunction, entry: Birthday): string =>
  statusLabel(t, {
    kind: entry.daysLeft === 0 ? 'today' : 'left',
    days: entry.daysLeft,
  });

/**
 * Birthdays as a strip of compact cards, soonest first. They are about the next time, not the
 * past, so they stay out of the timeline.
 */
export const BirthdayStrip: React.FC<{
  entries: Birthday[];
  onOpen: (id: string) => void;
}> = ({ entries, onOpen }) => {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Bleeds to the screen edges so it reads as scrollable; the content padding puts the margin back.
      style={{ marginHorizontal: -16, flexGrow: 0, marginBottom: 20 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
    >
      {entries.map((entry) => (
        <Pressable
          key={entry.item.id}
          onPress={() => onOpen(entry.item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${entry.item.title}, ${countdown(t, entry)}`}
          className="w-[176px] rounded-lg border border-border bg-surface p-3 active:opacity-70"
        >
          <View className="flex-row items-center gap-2">
            <ImportantDateIcon type={entry.item.type} />
            <Text className="flex-1 text-base leading-6 font-semibold text-ink" numberOfLines={2}>
              {entry.item.title}
            </Text>
          </View>
          {entry.turns !== null ? (
            <Text className="text-sm leading-5 text-ink-muted mt-2">
              {t('us.timeline.turns', { count: entry.turns })}
            </Text>
          ) : null}
          <Text
            className={`text-sm leading-5 font-semibold text-action ${entry.turns === null ? 'mt-2' : ''}`}
          >
            {countdown(t, entry)}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

/** The Birthdays filter: one card each, with the countdown as the big number on the right. */
export const BirthdayList: React.FC<{
  entries: Birthday[];
  onOpen: (id: string) => void;
}> = ({ entries, onOpen }) => {
  const { t } = useTranslation();
  const format = useFormat();
  return (
    <View>
      {entries.map((entry) => (
        <Pressable
          key={entry.item.id}
          onPress={() => onOpen(entry.item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${entry.item.title}, ${countdown(t, entry)}`}
          className="active:opacity-70"
        >
          <Card className="flex-row items-center gap-3">
            <ImportantDateIcon type={entry.item.type} large />
            <View className="flex-1">
              <Text className="text-base leading-6 font-semibold text-ink" numberOfLines={2}>
                {entry.item.title}
              </Text>
              <Text className="text-sm leading-5 text-ink-muted">
                {format.longDate(entry.next)}
              </Text>
              {entry.turns !== null ? (
                <Text className="text-sm leading-5 font-semibold text-ink">
                  {t('us.timeline.turns', { count: entry.turns })}
                </Text>
              ) : null}
            </View>
            <View className="items-center min-w-[72px] pl-3 border-l border-border">
              {entry.daysLeft === 0 ? (
                <Text className="text-body-strong text-action">
                  {t('importantDates.status.today')}
                </Text>
              ) : (
                <>
                  <Text className="text-display font-bold text-ink">{entry.daysLeft}</Text>
                  <Text className="text-xs leading-4 text-ink-muted">
                    {t('importantDates.detail.daysLeft', { count: entry.daysLeft })}
                  </Text>
                </>
              )}
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
  );
};
