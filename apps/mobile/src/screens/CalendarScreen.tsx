import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { addLocalDays, startOfLocalDay, isSameLocalDay, type CalendarEvent } from '@diade/domain';
import { getActiveEvents } from '../data/queries';
import { buildAgenda, formatAgendaTime, type AgendaItem } from '../data/agenda';
import { useLiveQuery } from '../data/useLiveQuery';
import { useFormat } from '../i18n';
import { EventForm } from '../components/EventForm';
import { Button, EmptyState, Pill, ScreenScaffold, SyncBadge, Card } from '../components/ui';

const AGENDA_DAYS = 60;

export const CalendarScreen: React.FC = () => {
  const { t } = useTranslation();
  const format = useFormat();
  const events = useLiveQuery(getActiveEvents, [] as CalendarEvent[]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const now = new Date();
  const from = startOfLocalDay(now);
  const to = addLocalDays(from, AGENDA_DAYS);

  const days = useMemo(() => {
    const agenda = buildAgenda(events.data, from, to);
    const groups: Array<{ day: Date; items: AgendaItem[] }> = [];
    for (const item of agenda) {
      const last = groups[groups.length - 1];
      if (last && isSameLocalDay(last.day, item.startAt)) {
        last.items.push(item);
      } else {
        groups.push({ day: startOfLocalDay(item.startAt), items: [item] });
      }
    }
    return groups;
    // from/to are recomputed each render; the data array is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.data]);

  const openEvent = (item: AgendaItem) => {
    const source = events.data.find((e) => e.id === item.eventId) ?? null;
    setEditing(source);
    setFormOpen(true);
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <ScreenScaffold
      eyebrow={t('calendar.eyebrow', { count: AGENDA_DAYS })}
      title={t('calendar.title')}
      right={
        <View className="items-end gap-2">
          <Button label={t('calendar.newEvent')} small onPress={openNew} />
        </View>
      }
    >
      <View className="mb-4">
        <SyncBadge />
      </View>

      {days.length === 0 ? (
        <Card>
          <EmptyState message={t('calendar.empty')} />
        </Card>
      ) : null}

      {days.map((group) => (
        <View key={group.day.toISOString()} className="mb-5">
          <Text className="text-sm font-bold text-ink-muted uppercase tracking-wider mb-2">
            {format.dayLabel(group.day, now)}
          </Text>
          <View className="bg-surface rounded-2xl border border-border overflow-hidden">
            {group.items.map((item, index) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => openEvent(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatAgendaTime(t, item)}`}
                className={`px-4 py-3 flex-row items-center justify-between ${index > 0 ? 'border-t border-border' : ''}`}
              >
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text className="text-sm text-ink-muted mt-0.5">
                    {formatAgendaTime(t, item)}
                    {item.recurring ? ` · ${t('calendar.repeats')}` : ''}
                    {item.category === 'important_date' ? ` · ${t('calendar.important')}` : ''}
                  </Text>
                </View>
                <Pill label={item.visibility === 'shared' ? t('common.shared') : t('common.personal')} tone={item.visibility} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <EventForm
        visible={formOpen}
        event={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </ScreenScaffold>
  );
};
