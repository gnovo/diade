import { sizes, space as spacing } from '@diade/design-tokens';
import {
  describeImportantDate,
  elapsedDays,
  type ImportantDate,
  parseDateOnly,
  upcomingAnniversaries,
} from '@diade/domain';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { alertLabel, importantDateTypeLabel, statusLabel } from '../data/importantDateDisplay';
import { Icon } from '../design';
import { useFormat } from '../i18n';
import { ImportantDateIcon } from './ImportantDateIcon';
import { Button, Card, Pill, SectionLabel } from './ui';

const MILESTONES = 4;

/** A single special day: the headline count, upcoming yearly milestones, alert and notes. */
export const ImportantDateDetail: React.FC<{
  visible: boolean;
  item: ImportantDate | null;
  onClose: () => void;
  onEdit: (item: ImportantDate) => void;
}> = ({ visible, item, onClose, onEdit }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const today = new Date();
  const original = item ? parseDateOnly(item.date) : null;
  const since = item ? elapsedDays(item, today) : null;
  const status = item ? describeImportantDate(item, today) : null;
  const milestones =
    item && item.repeat === 'yearly' ? upcomingAnniversaries(item, today, MILESTONES) : [];

  // Past dates headline the time elapsed since; future dates headline the countdown.
  const headline =
    since !== null
      ? { value: since, unit: 'since' as const }
      : status
        ? { value: status.days, unit: 'left' as const }
        : null;
  const isToday = status?.kind === 'today';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('importantDates.detail.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center"
          >
            <Icon name="x" size={sizes['icon-md']} />
          </Pressable>
          {item ? <Button label={t('common.edit')} small onPress={() => onEdit(item)} /> : null}
        </View>

        {item ? (
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: spacing[4],
              paddingTop: spacing[4],
              paddingBottom: spacing[8],
            }}
          >
            <View className="items-center mb-8">
              <ImportantDateIcon type={item.type} large />
              <Text className="text-sm leading-5 text-ink-muted mt-3">
                {importantDateTypeLabel(t, item.type)}
              </Text>
              <Text className="text-title-1 font-bold text-ink text-center mt-1">{item.title}</Text>

              {isToday ? (
                <Text className="text-display font-bold text-ink mt-4">{t('common.today')}</Text>
              ) : headline ? (
                <View className="items-center mt-4">
                  <Text className="text-display font-bold text-ink">{headline.value}</Text>
                  <Text className="text-body-strong text-ink-muted">
                    {t(
                      headline.unit === 'since'
                        ? 'importantDates.detail.daysSince'
                        : 'importantDates.detail.daysLeft',
                      {
                        count: headline.value,
                      },
                    )}
                  </Text>
                </View>
              ) : null}

              <Text className="text-base leading-6 text-ink-muted mt-3">
                {original ? format.longDate(original) : item.date}
              </Text>
              <View className="flex-row items-center gap-2 mt-3">
                <Pill label={t('common.shared')} tone="shared" />
                {item.pinned ? <Pill label={t('common.featured')} tone="neutral" /> : null}
              </View>
            </View>

            {milestones.length > 0 ? (
              <Card>
                <SectionLabel>{t('importantDates.detail.comingUp')}</SectionLabel>
                {milestones.map((milestone, index) => (
                  <View key={milestone.years}>
                    {index > 0 ? <View className="h-px bg-border my-3" /> : null}
                    <View className="flex-row items-center justify-between">
                      <Text className="text-base font-semibold text-ink">
                        {t('common.year', { count: milestone.years })}
                      </Text>
                      <View className="items-end">
                        <Text className="text-base font-semibold text-ink">
                          {statusLabel(t, {
                            kind: milestone.daysLeft === 0 ? 'today' : 'left',
                            days: milestone.daysLeft,
                          })}
                        </Text>
                        <Text className="text-sm text-ink-muted mt-0.5">
                          {format.longDate(milestone.date)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card>
              <SectionLabel>{t('importantDates.detail.details')}</SectionLabel>
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-ink">{t('importantDates.detail.repeats')}</Text>
                <Text className="text-base text-ink-muted">
                  {item.repeat === 'yearly'
                    ? t('importantDates.detail.everyYear')
                    : t('common.never')}
                </Text>
              </View>
              <View className="h-px bg-border my-3" />
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 mr-3 text-base text-ink">
                  {t('importantDates.detail.countsFirstDay')}
                </Text>
                <Text className="text-base text-ink-muted">
                  {item.countFirstDay ? t('common.yes') : t('common.no')}
                </Text>
              </View>
              <View className="h-px bg-border my-3" />
              <View className="flex-row items-center justify-between">
                <Text className="text-base text-ink">{t('importantDates.detail.alert')}</Text>
                <Text className="text-base text-ink-muted">
                  {alertLabel(t, item.alertOffsetDays)}
                </Text>
              </View>
              {item.notes ? (
                <>
                  <View className="h-px bg-border my-3" />
                  <Text className="text-sm font-semibold text-ink-muted mb-1">
                    {t('importantDates.detail.notes')}
                  </Text>
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
