import { sizes } from '@diade/design-tokens';
import {
  daysBetween,
  describeImportantDate,
  durationBetween,
  type ImportantDate,
  type TimelineEntry,
} from '@diade/domain';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { importantDateTypeLabel, statusLabel } from '../data/importantDateDisplay';
import { spanLabel } from '../data/timelineDisplay';
import { Icon, useColor } from '../design';
import { useFormat } from '../i18n';
import { ImportantDateIcon } from './ImportantDateIcon';

/** Width of the left column that holds the rail. The rail runs down its middle. */
const GUTTER = 48;
const RAIL_X = GUTTER / 2 - 1;
const RAIL_WIDTH = 2;

/** One piece of the rail. A dashed one (still ahead) clips a dashed border down to its left edge. */
const RailSegment: React.FC<{
  dashed: boolean;
  /** Start the line at the row's middle, where the first node sits. */
  fromMiddle: boolean;
  /** End the line at the row's middle, where the last node sits. */
  toMiddle: boolean;
}> = ({ dashed, fromMiddle, toMiddle }) => {
  const color = useColor('border-strong');
  const position = {
    position: 'absolute' as const,
    left: RAIL_X,
    width: RAIL_WIDTH,
    top: fromMiddle ? '50%' : 0,
    bottom: toMiddle ? '50%' : 0,
  };
  if (!dashed) return <View pointerEvents="none" style={[position, { backgroundColor: color }]} />;
  return (
    <View pointerEvents="none" style={[position, { overflow: 'hidden' }]}>
      <View
        style={{
          flex: 1,
          width: 8,
          marginVertical: -RAIL_WIDTH,
          borderWidth: RAIL_WIDTH,
          borderStyle: 'dashed',
          borderColor: color,
        }}
      />
    </View>
  );
};

/** A row of the timeline: the rail and node on the left, the content on the right. */
const RailRow: React.FC<{
  node?: React.ReactNode;
  dashed?: boolean;
  first: boolean;
  last: boolean;
  /** Only a row with a node can start or end the rail at its middle. */
  children: React.ReactNode;
}> = ({ node, dashed = false, first, last, children }) => (
  <View className="flex-row">
    <View style={{ width: GUTTER }} className="items-center justify-center">
      <RailSegment dashed={dashed} fromMiddle={first && !!node} toMiddle={last && !!node} />
      {node}
    </View>
    <View className="flex-1 justify-center">{children}</View>
  </View>
);

const Dot: React.FC<{ future: boolean }> = ({ future }) => (
  <View
    className={`w-3 h-3 rounded-full bg-surface border-2 ${future ? 'border-dashed' : ''} border-ink-muted`}
  />
);

export const DatesTimeline: React.FC<{
  entries: Array<TimelineEntry<ImportantDate>>;
  today: Date;
  onOpen: (id: string) => void;
}> = ({ entries, today, onOpen }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const inkMuted = useColor('ink-muted');

  return (
    <View>
      {entries.map((entry, index) => {
        const first = index === 0;
        const last = index === entries.length - 1;

        switch (entry.kind) {
          case 'year':
            return (
              <RailRow key={entry.key} first={first} last={last}>
                <View className="flex-row items-center pt-3 pb-1 gap-3">
                  <Text className="text-xs leading-4 font-semibold text-ink">{entry.year}</Text>
                  <View className="flex-1 h-px bg-border" />
                </View>
              </RailRow>
            );

          case 'today':
            return (
              <RailRow
                key={entry.key}
                first={first}
                last={last}
                node={<View className="w-4 h-4 rounded-full bg-action" />}
              >
                <View className="flex-row items-center gap-3 py-2">
                  <View className="bg-action rounded-full px-3 py-1">
                    <Text className="text-xs leading-4 font-semibold text-on-action uppercase tracking-wider">
                      {t('importantDates.status.today')}
                    </Text>
                  </View>
                  <Text className="text-xs leading-4 text-ink-muted">{format.longDate(today)}</Text>
                </View>
              </RailRow>
            );

          case 'gap':
            return (
              <RailRow key={entry.key} first={first} last={last}>
                <Text className="text-xs leading-4 text-ink-muted py-1">
                  {spanLabel(t, entry.duration, entry.days)}
                </Text>
              </RailRow>
            );

          case 'tick': {
            const together = t('us.timeline.together', { count: entry.years });
            return (
              <RailRow
                key={entry.key}
                first={first}
                last={last}
                dashed={entry.future}
                node={<Dot future={entry.future} />}
              >
                <View
                  accessible
                  accessibilityLabel={`${together}, ${format.longDate(entry.date)}`}
                  className="flex-row items-center justify-between gap-3 min-h-[40px]"
                >
                  <Text
                    className={`text-base leading-6 ${entry.future ? 'text-ink-muted' : 'text-ink'}`}
                  >
                    {together}
                  </Text>
                  <Text className="text-xs leading-4 text-ink-muted">
                    {format.longDate(entry.date)}
                  </Text>
                </View>
              </RailRow>
            );
          }

          case 'milestone': {
            const { item } = entry;
            const when = entry.future
              ? statusLabel(t, describeImportantDate(item, today))
              : t('us.timeline.ago', {
                  duration: spanLabel(
                    t,
                    durationBetween(entry.date, today),
                    daysBetween(entry.date, today),
                  ),
                });
            return (
              <RailRow
                key={entry.key}
                first={first}
                last={last}
                dashed={entry.future}
                node={<ImportantDateIcon type={item.type} large={entry.origin} />}
              >
                <Pressable
                  onPress={() => onOpen(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('us.itemLabel', {
                    title: item.title,
                    type: importantDateTypeLabel(t, item.type),
                    status: when,
                  })}
                  className={`flex-row items-center gap-3 rounded-lg bg-surface px-4 py-3 my-1 min-h-[64px] active:opacity-70 ${
                    entry.origin ? 'border-2 border-action' : 'border border-border'
                  } ${entry.future ? 'border-dashed' : ''}`}
                >
                  <View className="flex-1">
                    <Text className="text-base leading-6 font-semibold text-ink" numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text className="text-sm leading-5 text-ink-muted">
                      {format.longDate(entry.date)} · {when}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={sizes['icon-sm']} color={inkMuted} />
                </Pressable>
              </RailRow>
            );
          }

          default:
            return null;
        }
      })}
    </View>
  );
};
