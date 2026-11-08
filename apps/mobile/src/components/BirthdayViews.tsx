import type { BirthdayEntry, ImportantDate, ImportantDateType } from '@diade/domain';
import type { TFunction } from '@diade/i18n';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { statusLabel } from '../data/importantDateDisplay';
import { Avatar } from '../design';
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
 * The couple's own birthdays show the person (the same round initial as the Today header);
 * everyone else's keeps the cake icon. Falls back to the icon until the partner has joined.
 */
const BirthdayAvatar: React.FC<{ type: ImportantDateType; large?: boolean }> = ({
  type,
  large,
}) => {
  const { user, members } = useAuth();
  const partner = members.find((m) => m.userId !== user?.id);
  const person =
    type === 'my_birthday'
      ? { name: user?.displayName || user?.email, tone: 'me' as const }
      : type === 'partner_birthday'
        ? { name: partner?.displayName, tone: 'partner' as const }
        : null;
  if (!person?.name) return <ImportantDateIcon type={type} large={large} />;
  return <Avatar name={person.name} tone={person.tone} size={large ? 56 : 40} />;
};

/** Space between cards, and the page's side padding the strip bleeds through. */
const STRIP_GAP = 12;
const PAGE_PADDING = 16;

/**
 * Birthdays as a strip of compact cards, soonest first. They are about the next time, not the
 * past, so they stay out of the timeline.
 */
export const BirthdayStrip: React.FC<{
  entries: Birthday[];
  onOpen: (id: string) => void;
}> = ({ entries, onOpen }) => {
  const { t } = useTranslation();
  // Two cards fill the same width as the card above; a third scrolls in from the right.
  const cardWidth = (useWindowDimensions().width - PAGE_PADDING * 2 - STRIP_GAP) / 2;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Bleeds to the screen edges so it reads as scrollable; the content padding puts the margin back.
      style={{ marginHorizontal: -PAGE_PADDING, flexGrow: 0, marginBottom: 20 }}
      contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, gap: STRIP_GAP }}
    >
      {entries.map((entry) => (
        <Pressable
          key={entry.item.id}
          onPress={() => onOpen(entry.item.id)}
          accessibilityRole="button"
          accessibilityLabel={`${entry.item.title}, ${countdown(t, entry)}`}
          style={{ width: cardWidth }}
          className="rounded-lg border border-border bg-surface p-3 active:opacity-70"
        >
          <View className="flex-row items-center gap-2">
            <BirthdayAvatar type={entry.item.type} />
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
            <BirthdayAvatar type={entry.item.type} large />
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
