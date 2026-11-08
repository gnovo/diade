import { sizes } from '@diade/design-tokens';
import { externalEventTitle, formatTime, startOfLocalDay } from '@diade/domain';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { Sheet } from '../components/Sheet';
import { Card, EmptyState, SectionLabel } from '../components/ui';
import type { PartnerDay } from '../data/partnerDay';
import { Icon, useColor } from '../design';
import { useFormat } from '../i18n';
import { userInitial } from './ProfileScreen';

/**
 * The partner's day, read-only: their open tasks and Google events. Never editable here, and it shows
 * only what the viewer may already see (see `partnerDay`).
 */
export const PartnerDayScreen: React.FC<{
  visible: boolean;
  onClose: () => void;
  name: string;
  day: PartnerDay;
  now: Date;
}> = ({ visible, onClose, name, day, now }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const starColor = useColor('warning');
  const firstName = name.trim().split(/\s+/)[0];
  const dayStart = startOfLocalDay(now);
  const isOverdue = (due: string) => startOfLocalDay(new Date(due)).getTime() < dayStart.getTime();

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('partnerDay.title', { name: firstName })}
      closeLabel={t('partnerDay.close')}
    >
      <View className="flex-row items-center mb-6">
        <View className="w-10 h-10 rounded-full bg-brand-mint items-center justify-center mr-3">
          <Text className="text-base font-semibold text-brand-deep">{userInitial(name)}</Text>
        </View>
        <Text className="flex-1 text-sm leading-5 text-ink-muted">
          {t('partnerDay.note', { name: firstName })}
        </Text>
      </View>

      <Card>
        <SectionLabel>{t('partnerDay.comingUp')}</SectionLabel>
        {day.events.length === 0 ? <EmptyState message={t('partnerDay.noEvents')} /> : null}
        {day.events.map((entry, index) => (
          <View key={entry.key}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <Text
              className={`text-base font-semibold ${entry.event.redacted ? 'text-ink-muted' : 'text-ink'}`}
              numberOfLines={1}
            >
              {externalEventTitle(entry.event, {
                busy: t('calendar.busy'),
                untitled: t('calendar.untitled'),
              })}
            </Text>
            <Text className="text-sm text-ink-muted mt-0.5">
              {format.dayLabel(entry.day, now)} ·{' '}
              {entry.isAllDay
                ? t('format.allDay')
                : `${formatTime(entry.startAt!)}–${formatTime(entry.endAt!)}`}
            </Text>
          </View>
        ))}
      </Card>

      <Card>
        <SectionLabel>{t('partnerDay.tasks')}</SectionLabel>
        {day.tasks.length === 0 ? <EmptyState message={t('partnerDay.noTasks')} /> : null}
        {day.tasks.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center">
              <View className="flex-1 mr-2">
                <Text className="text-base font-semibold text-ink" numberOfLines={2}>
                  {task.title}
                </Text>
                {task.dueDate ? (
                  <Text className="text-sm text-ink-muted mt-0.5">
                    {isOverdue(task.dueDate) ? `${t('today.overdue')} · ` : ''}
                    {t('household.due', { day: format.dayLabel(new Date(task.dueDate), now) })}
                  </Text>
                ) : null}
              </View>
              {task.priority === 'important' ? (
                <Icon
                  name="star"
                  size={sizes['icon-sm']}
                  color={starColor}
                  fill={starColor}
                  title={t('today.importantTask')}
                />
              ) : null}
            </View>
          </View>
        ))}
      </Card>
    </Sheet>
  );
};
