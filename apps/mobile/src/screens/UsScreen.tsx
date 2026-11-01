import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { addLocalDays, startOfLocalDay, formatLongDate, type CalendarEvent } from '@diade/domain';
import { getActiveEvents } from '../data/queries';
import { buildAgenda } from '../data/agenda';
import { useLiveQuery } from '../data/useLiveQuery';
import { EventForm } from '../components/EventForm';
import { Button, Card, EmptyState, Pill, ScreenScaffold, SyncBadge } from '../components/ui';

const HORIZON_DAYS = 400; // covers a full yearly cycle plus a margin

export const UsScreen: React.FC = () => {
  const events = useLiveQuery(getActiveEvents, [] as CalendarEvent[]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const now = new Date();
  const from = startOfLocalDay(now);
  const to = addLocalDays(from, HORIZON_DAYS);

  const importantEvents = events.data.filter((e) => e.category === 'important_date');
  const upcoming = buildAgenda(importantEvents, from, to);

  // Show each important date once, at its next occurrence.
  const seen = new Set<string>();
  const next = upcoming.filter((item) => {
    if (seen.has(item.eventId)) return false;
    seen.add(item.eventId);
    return true;
  });

  const daysUntil = (date: Date) => Math.round((startOfLocalDay(date).getTime() - from.getTime()) / 86_400_000);

  return (
    <ScreenScaffold
      eyebrow="Us"
      title="Important dates"
      right={<Button label="+ Date" small onPress={() => { setEditing(null); setFormOpen(true); }} />}
    >
      <View className="mb-4">
        <SyncBadge />
      </View>

      <Card>
        {next.length === 0 ? (
          <EmptyState message="Add the dates that matter: when you met, moved in, or a birthday." />
        ) : null}
        {next.map((item, index) => {
          const source = importantEvents.find((e) => e.id === item.eventId) ?? null;
          const days = daysUntil(item.startAt);
          return (
            <View key={item.eventId}>
              {index > 0 ? <View className="h-px bg-border my-3" /> : null}
              <TouchableOpacity
                onPress={() => {
                  setEditing(source);
                  setFormOpen(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                className="flex-row items-center justify-between"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold text-ink">{item.title}</Text>
                  <Text className="text-xs text-ink-muted mt-0.5">
                    {formatLongDate(item.startAt)}
                    {item.recurring ? ' · every year' : ''}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <Text className="text-sm font-semibold text-primary">
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                  </Text>
                  <Pill label={item.visibility === 'shared' ? 'Shared' : 'Personal'} tone={item.visibility} />
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </Card>

      <EventForm
        visible={formOpen}
        event={editing}
        defaultCategory="important_date"
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
    </ScreenScaffold>
  );
};
