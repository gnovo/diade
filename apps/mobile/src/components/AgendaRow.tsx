import { sizes } from '@diade/design-tokens';
import { describeImportantDate, externalEventTitle, formatTime } from '@diade/domain';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { formatAgendaTime } from '../data/agenda';
import { statusLabel } from '../data/importantDateDisplay';
import type { AgendaEntry } from '../data/unifiedAgenda';
import { Icon, useColor } from '../design';
import { Checkbox, Pill } from './ui';

/** A small filled star before the title of a highlighted event. */
const StarMark: React.FC = () => {
  const color = useColor('warning');
  return (
    <View className="mr-1.5">
      <Icon name="star" size={sizes['icon-sm']} color={color} fill={color} />
    </View>
  );
};

export interface AgendaRowHandlers {
  /** The occurrence's start comes along, so a training block opens on its own day. */
  onOpenEvent: (eventId: string, occurrenceStart: Date) => void;
  onOpenExternal: (entry: Extract<AgendaEntry, { kind: 'external' }>) => void;
  onToggleTask: (task: Extract<AgendaEntry, { kind: 'task' }>['task']) => void;
  partnerName: (userId: string | null) => string;
}

/** One line of the unified agenda. Every kind keeps the same height rhythm and a 48px target. */
export const AgendaRow: React.FC<{ entry: AgendaEntry; now: Date } & AgendaRowHandlers> = ({
  entry,
  now,
  onOpenEvent,
  onOpenExternal,
  onToggleTask,
  partnerName,
}) => {
  const { t } = useTranslation();

  switch (entry.kind) {
    case 'event': {
      const { item } = entry;
      return (
        <Pressable
          onPress={() => onOpenEvent(item.eventId, item.startAt)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}, ${formatAgendaTime(t, item)}`}
          className="px-4 py-3 flex-row items-center justify-between min-h-[56px]"
        >
          <View className="flex-1 mr-3">
            <View className="flex-row items-center">
              {item.highlighted ? <StarMark /> : null}
              <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            <Text className="text-sm text-ink-muted mt-0.5">
              {formatAgendaTime(t, item)}
              {item.recurring ? ` · ${t('calendar.repeats')}` : ''}
              {item.category === 'important_date' ? ` · ${t('calendar.important')}` : ''}
              {item.workoutDone === null
                ? ''
                : ` · ${t(item.workoutDone ? 'training.doneShort' : 'training.blockShort')}`}
            </Text>
          </View>
          <Pill
            label={item.visibility === 'shared' ? t('common.shared') : t('common.personal')}
            tone={item.visibility}
          />
        </Pressable>
      );
    }

    case 'external': {
      const { event, calendar, mine } = entry;
      const title = externalEventTitle(event, {
        busy: t('calendar.busy'),
        untitled: t('calendar.untitled'),
      });
      const time = entry.isAllDay
        ? t('format.allDay')
        : `${formatTime(entry.startAt!)}–${formatTime(entry.endAt!)}`;
      return (
        <Pressable
          onPress={() => onOpenExternal(entry)}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${time}`}
          className="px-4 py-3 flex-row items-center min-h-[56px]"
        >
          <View
            style={{ backgroundColor: calendar?.color ?? '#64748B' }}
            className="w-1.5 self-stretch rounded-full mr-3"
            importantForAccessibility="no-hide-descendants"
          />
          <View className="flex-1 mr-3">
            <View className="flex-row items-center">
              {event.highlighted ? <StarMark /> : null}
              <Text
                className={`flex-1 text-base font-semibold ${event.redacted ? 'text-ink-muted' : 'text-ink'}`}
                numberOfLines={1}
              >
                {title}
              </Text>
            </View>
            <Text className="text-sm text-ink-muted mt-0.5" numberOfLines={1}>
              {time}
              {event.status === 'tentative' ? ` · ${t('calendar.detail.tentative')}` : ''}
              {event.location && !event.redacted ? ` · ${event.location}` : ''}
            </Text>
          </View>
          <Pill label={mine ? t('calendar.mine') : partnerName(event.userId)} />
        </Pressable>
      );
    }

    case 'task': {
      const { task } = entry;
      const done = task.status === 'completed';
      const important = task.priority === 'important';
      return (
        <View className="px-4 py-1 flex-row items-center min-h-[56px]">
          <Checkbox
            checked={done}
            onToggle={() => onToggleTask(task)}
            label={t(done ? 'calendar.reopenTask' : 'calendar.completeTask', { title: task.title })}
          />
          <View className="flex-1 mr-2">
            <Text
              className={`text-base ${done ? 'text-ink-muted line-through' : 'font-medium text-ink'}`}
              numberOfLines={2}
            >
              {task.title}
            </Text>
            <Text className="text-sm text-ink-muted">{t('calendar.task')}</Text>
          </View>
          {important && !done ? (
            <View className="flex-row items-center mr-2">
              <Icon name="star" size={sizes['icon-sm']} title={t('calendar.importantTask')} />
            </View>
          ) : null}
          <Pill label={partnerName(task.assigneeId)} />
        </View>
      );
    }

    case 'important_date': {
      const { item } = entry;
      return (
        <View className="px-4 py-3 flex-row items-center justify-between min-h-[56px]">
          <View className="flex-row items-center flex-1 mr-3">
            <Icon name="heart" size={sizes['icon-sm']} />
            <Text className="text-base font-semibold text-ink ml-2 flex-1" numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <Text className="text-sm text-ink-muted">
            {statusLabel(t, describeImportantDate(item, now))}
          </Text>
        </View>
      );
    }
  }
};
