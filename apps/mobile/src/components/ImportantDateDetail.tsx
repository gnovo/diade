import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sizes, space as spacing } from '@diade/design-tokens';
import {
  describeImportantDate,
  elapsedDays,
  formatLongDate,
  parseDateOnly,
  upcomingAnniversaries,
  type ImportantDate,
} from '@diade/domain';
import { Icon } from '../design';
import { IMPORTANT_DATE_TYPE_META, alertLabel, plural, statusLabel } from '../data/importantDateDisplay';
import { Button, Card, Pill, SectionLabel } from './ui';
import { ImportantDateIcon } from './ImportantDateIcon';

const MILESTONES = 4;

/** A single special day: the headline count, upcoming yearly milestones, alert and notes. */
export const ImportantDateDetail: React.FC<{
  visible: boolean;
  item: ImportantDate | null;
  onClose: () => void;
  onEdit: (item: ImportantDate) => void;
}> = ({ visible, item, onClose, onEdit }) => {
  const today = new Date();
  const original = item ? parseDateOnly(item.date) : null;
  const since = item ? elapsedDays(item, today) : null;
  const status = item ? describeImportantDate(item, today) : null;
  const milestones = item && item.repeat === 'yearly' ? upcomingAnniversaries(item, today, MILESTONES) : [];

  // Past dates headline the time elapsed since; future dates headline the countdown.
  const headline = since !== null ? { value: since, unit: 'since' } : status ? { value: status.days, unit: 'left' } : null;
  const isToday = status?.kind === 'today';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center"
          >
            <Icon name="x" size={sizes['icon-md']} />
          </Pressable>
          {item ? <Button label="Edit" small onPress={() => onEdit(item)} /> : null}
        </View>

        {item ? (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: spacing[4], paddingTop: spacing[4], paddingBottom: spacing[8] }}
          >
            <View className="items-center mb-8">
              <ImportantDateIcon type={item.type} large />
              <Text className="text-sm leading-5 text-ink-muted mt-3">{IMPORTANT_DATE_TYPE_META[item.type].label}</Text>
              <Text className="text-title-1 font-bold text-ink text-center mt-1">{item.title}</Text>

              {isToday ? (
                <Text className="text-display font-bold text-ink mt-4">Today</Text>
              ) : headline ? (
                <View className="items-center mt-4">
                  <Text className="text-display font-bold text-ink">{headline.value}</Text>
                  <Text className="text-body-strong text-ink-muted">
                    {headline.value === 1 ? 'day' : 'days'} {headline.unit}
                  </Text>
                </View>
              ) : null}

              <Text className="text-base leading-6 text-ink-muted mt-3">
                {original ? formatLongDate(original) : item.date}
              </Text>
              <View className="flex-row items-center gap-2 mt-3">
                <Pill label="Shared" tone="shared" />
                {item.pinned ? <Pill label="Featured" tone="neutral" /> : null}
              </View>
            </View>

            {milestones.length > 0 ? (
              <Card>
                <SectionLabel>Coming up</SectionLabel>
                {milestones.map((milestone, index) => (
                  <View key={milestone.years}>
                    {index > 0 ? <View className="h-px bg-border my-3" /> : null}
                    <View className="flex-row items-center justify-between">
                      <Text className="text-base font-semibold text-ink">{plural(milestone.years, 'year')}</Text>
                      <View className="items-end">
                        <Text className="text-base font-semibold text-ink">
                          {statusLabel({ kind: milestone.daysLeft === 0 ? 'today' : 'left', days: milestone.daysLeft })}
                        </Text>
                        <Text className="text-sm text-ink-muted mt-0.5">{formatLongDate(milestone.date)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card>
              <SectionLabel>Details</SectionLabel>
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-ink">Repeats</Text>
                <Text className="text-base text-ink-muted">{item.repeat === 'yearly' ? 'Every year' : 'Never'}</Text>
              </View>
              <View className="h-px bg-border my-3" />
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 mr-3 text-base text-ink">Counts the first day as day 1</Text>
                <Text className="text-base text-ink-muted">{item.countFirstDay ? 'Yes' : 'No'}</Text>
              </View>
              <View className="h-px bg-border my-3" />
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-ink">Alert</Text>
                <Text className="text-base text-ink-muted">{alertLabel(item.alertOffsetDays)}</Text>
              </View>
              {item.notes ? (
                <>
                  <View className="h-px bg-border my-3" />
                  <Text className="text-sm font-semibold text-ink-muted mb-1">Notes</Text>
                  <Text className="text-base leading-6 text-ink">{item.notes}</Text>
                </>
              ) : null}
            </Card>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
};
