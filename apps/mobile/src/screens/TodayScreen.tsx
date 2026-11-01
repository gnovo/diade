import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  addLocalDays,
  canAccessRecord,
  formatDayLabel,
  formatLongDate,
  isTaskAssignedToUser,
  startOfLocalDay,
  type Task,
  type CalendarEvent,
} from '@diade/domain';
import { useAuth } from '../context/AuthContext';
import { getActiveEvents, getActiveTasks, getActiveLists, getActiveListItems, getInboxItems } from '../data/queries';
import { insertRecord, updateRecord } from '../data/repository';
import { buildAgenda, formatAgendaTime } from '../data/agenda';
import { useLiveQuery } from '../data/useLiveQuery';
import { Button, Card, Checkbox, EmptyState, Pill, ScreenScaffold, SectionLabel, SyncBadge, TextField, useWriteContext } from '../components/ui';

const TODAY_TASK_LIMIT = 5;
const EVENT_LIMIT = 4;
const LOOKAHEAD_DAYS = 30;

export const TodayScreen: React.FC = () => {
  const { user, members } = useAuth();
  const ctx = useWriteContext();
  const [captureText, setCaptureText] = useState('');
  const [saving, setSaving] = useState(false);
  const [captureNote, setCaptureNote] = useState<string | null>(null);

  const now = new Date();
  const dayStart = startOfLocalDay(now);
  const lookaheadEnd = addLocalDays(dayStart, LOOKAHEAD_DAYS);
  const tomorrowEnd = addLocalDays(dayStart, 2);

  const events = useLiveQuery(getActiveEvents, [] as CalendarEvent[]);
  const tasks = useLiveQuery(getActiveTasks, [] as Task[]);
  const lists = useLiveQuery(getActiveLists, []);
  const listItems = useLiveQuery(getActiveListItems, []);
  const inbox = useLiveQuery(getInboxItems, []);

  const upcoming = buildAgenda(events.data.filter((e) => e.category === 'general'), now, tomorrowEnd)
    .filter((item) => item.endAt.getTime() >= now.getTime())
    .slice(0, EVENT_LIMIT);

  const importantDates = buildAgenda(
    events.data.filter((e) => e.category === 'important_date'),
    dayStart,
    lookaheadEnd,
  ).slice(0, 2);

  const openTasks = tasks.data
    .filter((t) => t.status === 'todo' && canAccessRecord(t, user?.id ?? '') && isTaskAssignedToUser(t, user?.id ?? ''))
    .slice(0, TODAY_TASK_LIMIT);

  const groceryListIds = new Set(lists.data.filter((l) => l.category === 'groceries').map((l) => l.id));
  const openGroceries = listItems.data.filter((i) => groceryListIds.has(i.listId) && !i.isChecked);

  const partnerName = (id: string | null) => {
    if (id === null) return 'Both';
    if (id === user?.id) return 'Me';
    return members.find((m) => m.userId === id)?.displayName ?? 'Partner';
  };

  const toggleTask = async (task: Task) => {
    const completing = task.status !== 'completed';
    await updateRecord('tasks', task.id, {
      status: completing ? 'completed' : 'todo',
      completedAt: completing ? new Date().toISOString() : null,
    });
  };

  const handleCapture = async () => {
    const content = captureText.trim();
    if (!content || !ctx) return;
    try {
      setSaving(true);
      await insertRecord('capture_items', ctx, { content, captureType: 'text', status: 'inbox' });
      setCaptureText('');
      setCaptureNote('Saved to your inbox');
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScaffold
      eyebrow={formatLongDate(now)}
      title="Today"
      right={<SyncBadge />}
    >
      {/* Quick capture: text only for now; saved locally first, synced when possible */}
      <View className="bg-surface rounded-full border border-border px-4 py-2 flex-row items-center mb-2">
        <TextField
          value={captureText}
          onChangeText={(t: string) => {
            setCaptureText(t);
            setCaptureNote(null);
          }}
          onSubmitEditing={handleCapture}
          placeholder="Capture a task, event or note…"
          returnKeyType="done"
          maxLength={5000}
          className="flex-1 text-ink text-sm py-1"
          style={{ borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 0 }}
        />
        <Button label={saving ? '…' : 'Save'} small onPress={handleCapture} disabled={saving || !captureText.trim()} />
      </View>
      <View className="flex-row justify-between px-2 mb-6">
        <Text className="text-sm text-ink-muted">{captureNote ?? (inbox.data.length ? `${inbox.data.length} in your inbox` : ' ')}</Text>
      </View>

      <Card>
        <SectionLabel>Coming up</SectionLabel>
        {upcoming.length === 0 ? <EmptyState message="Nothing in the next two days." /> : null}
        {upcoming.map((item, index) => (
          <View key={item.key}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-2">
                <Text className="text-base font-semibold text-ink" numberOfLines={1}>{item.title}</Text>
                <Text className="text-sm text-ink-muted mt-0.5">
                  {formatDayLabel(item.startAt, now)} · {formatAgendaTime(item)}
                </Text>
              </View>
              <Pill label={item.visibility === 'shared' ? 'Shared' : 'Personal'} tone={item.visibility} />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionLabel>Tasks due soon</SectionLabel>
        {openTasks.length === 0 ? <EmptyState message="No open tasks. Nicely done." /> : null}
        {openTasks.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center">
              <Checkbox checked={false} onToggle={() => toggleTask(task)} label={`Complete ${task.title}`} />
              <Text className="flex-1 text-sm font-medium text-ink mr-2" numberOfLines={1}>{task.title}</Text>
              <Pill label={partnerName(task.assigneeId)} />
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <SectionLabel>Groceries</SectionLabel>
        {openGroceries.length === 0 ? (
          <EmptyState message="Nothing left to buy." />
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {openGroceries.slice(0, 4).map((item) => (
              <View key={item.id} className="bg-surface-sunken border border-border px-3 py-1.5 rounded-full">
                <Text className="text-base font-medium text-ink">{item.name}</Text>
              </View>
            ))}
            {openGroceries.length > 4 ? (
              <View className="bg-bg border border-border px-3 py-1.5 rounded-full">
                <Text className="text-sm text-ink-muted">+{openGroceries.length - 4} more</Text>
              </View>
            ) : null}
          </View>
        )}
      </Card>

      {importantDates.length > 0 ? (
        <Card>
          <SectionLabel>Important dates</SectionLabel>
          {importantDates.map((item, index) => (
            <View key={item.key} className={index > 0 ? 'mt-3' : ''}>
              <Text className="text-base font-semibold text-ink">{item.title}</Text>
              <Text className="text-sm text-ink-muted mt-0.5">{formatDayLabel(item.startAt, now)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </ScreenScaffold>
  );
};
