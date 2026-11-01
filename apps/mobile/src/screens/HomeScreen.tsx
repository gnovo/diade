import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  canAccessRecord,
  formatDayLabel,
  parseLocalDateTime,
  type Task,
  type Visibility,
} from '@diade/domain';
import { useAuth } from '../context/AuthContext';
import { getActiveTasks } from '../data/queries';
import { insertRecord, updateRecord, deleteRecord } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Pill,
  ScreenScaffold,
  Segmented,
  SectionLabel,
  SyncBadge,
  TextField,
  useWriteContext,
  type SegmentOption,
} from '../components/ui';

type AssigneeChoice = 'both' | 'me' | 'partner';

export const HomeScreen: React.FC = () => {
  const { user, members } = useAuth();
  const ctx = useWriteContext();
  const tasks = useLiveQuery(getActiveTasks, [] as Task[]);

  const partner = members.find((m) => m.userId !== user?.id) ?? null;
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignee, setAssignee] = useState<AssigneeChoice>('both');
  const [visibility, setVisibility] = useState<Visibility>('shared');
  const [showDone, setShowDone] = useState(false);

  const visible = tasks.data.filter((t) => canAccessRecord(t, user?.id ?? ''));
  const open = visible.filter((t) => t.status !== 'completed');
  const done = visible.filter((t) => t.status === 'completed');

  const assigneeOptions: SegmentOption<AssigneeChoice>[] = [
    { value: 'both', label: 'Both' },
    { value: 'me', label: 'Me' },
    ...(partner ? [{ value: 'partner' as const, label: partner.displayName.split(' ')[0] }] : []),
  ];

  const assigneeIdFor = (choice: AssigneeChoice): string | null => {
    if (choice === 'me') return user?.id ?? null;
    if (choice === 'partner') return partner?.userId ?? null;
    return null;
  };

  const assigneeLabel = (task: Task) => {
    if (task.assigneeId === null) return 'Both';
    if (task.assigneeId === user?.id) return 'Me';
    return partner && task.assigneeId === partner.userId ? partner.displayName.split(' ')[0] : 'Partner';
  };

  const addTask = async () => {
    const trimmed = title.trim();
    if (!trimmed || !ctx) return;

    let dueIso: string | null = null;
    if (dueDate.trim()) {
      const parsed = parseLocalDateTime(dueDate, '23:59');
      if (!parsed) {
        Alert.alert('Check the due date', 'Use YYYY-MM-DD, or leave it empty.');
        return;
      }
      dueIso = parsed.toISOString();
    }

    try {
      await insertRecord('tasks', ctx, {
        title: trimmed,
        dueDate: dueIso,
        assigneeId: assigneeIdFor(assignee),
        visibility,
        status: 'todo',
      });
      setTitle('');
      setDueDate('');
    } catch (err) {
      Alert.alert('Could not add task', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const toggle = (task: Task) => {
    const completing = task.status !== 'completed';
    return updateRecord('tasks', task.id, {
      status: completing ? 'completed' : 'todo',
      completedAt: completing ? new Date().toISOString() : null,
    });
  };

  const confirmDelete = (task: Task) => {
    Alert.alert('Delete task?', `"${task.title}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord('tasks', task.id) },
    ]);
  };

  return (
    <ScreenScaffold eyebrow="Shared household" title="Household" right={<SyncBadge />}>
      <Card>
        <SectionLabel>New task</SectionLabel>
        <TextField
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={addTask}
          placeholder="Book the plumber, water the plants…"
          maxLength={255}
          returnKeyType="done"
        />
        <View className="mt-3">
          <TextField value={dueDate} onChangeText={setDueDate} placeholder="Due (YYYY-MM-DD, optional)" maxLength={10} />
        </View>
        <Text className="text-xs font-semibold text-ink-muted mt-4 mb-1.5">Who</Text>
        <Segmented<AssigneeChoice> value={assignee} onChange={setAssignee} options={assigneeOptions} />
        <Text className="text-xs font-semibold text-ink-muted mt-4 mb-1.5">Visibility</Text>
        <Segmented<Visibility>
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'shared', label: 'Both of us' },
            { value: 'personal', label: 'Only me' },
          ]}
        />
        <View className="mt-4">
          <Button label="Add task" onPress={addTask} disabled={!title.trim()} />
        </View>
      </Card>

      <Card>
        <SectionLabel right={<Text className="text-xs text-ink-muted">{open.length} open</Text>}>To do</SectionLabel>
        {open.length === 0 ? <EmptyState message="All caught up." /> : null}
        {open.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center">
              <Checkbox checked={false} onToggle={() => toggle(task)} label={`Complete ${task.title}`} />
              <View className="flex-1 mr-2" accessibilityHint="Long press to delete">
                <Text
                  className="text-sm font-medium text-ink"
                  numberOfLines={2}
                  onLongPress={() => confirmDelete(task)}
                >
                  {task.title}
                </Text>
                {task.dueDate ? (
                  <Text className="text-xs text-ink-muted mt-0.5">
                    Due {formatDayLabel(new Date(task.dueDate), new Date())}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-1.5">
                {task.visibility === 'personal' ? <Pill label="Personal" tone="personal" /> : null}
                <Pill label={assigneeLabel(task)} />
              </View>
            </View>
          </View>
        ))}
      </Card>

      {done.length > 0 ? (
        <Card>
          <SectionLabel
            right={
              <Button label={showDone ? 'Hide' : `Show (${done.length})`} variant="ghost" small onPress={() => setShowDone((v) => !v)} />
            }
          >
            Done
          </SectionLabel>
          {showDone
            ? done.slice(0, 20).map((task, index) => (
                <View key={task.id}>
                  {index > 0 ? <View className="h-px bg-border my-3" /> : null}
                  <View className="flex-row items-center">
                    <Checkbox checked onToggle={() => toggle(task)} label={`Reopen ${task.title}`} />
                    <Text className="flex-1 text-sm text-ink-muted line-through" numberOfLines={1}>
                      {task.title}
                    </Text>
                  </View>
                </View>
              ))
            : null}
        </Card>
      ) : null}
    </ScreenScaffold>
  );
};
