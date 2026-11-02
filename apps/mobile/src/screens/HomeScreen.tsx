import React, { useState } from 'react';
import { View, Text, Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  canAccessRecord,
  parseLocalDateTime,
  type Task,
  type Visibility,
} from '@diade/domain';
import { useAuth } from '../context/AuthContext';
import { getActiveTasks } from '../data/queries';
import { insertRecord, updateRecord, deleteRecord } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import { useFormat } from '../i18n';
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
  const { t } = useTranslation();
  const format = useFormat();
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
    { value: 'both', label: t('common.both') },
    { value: 'me', label: t('common.me') },
    ...(partner ? [{ value: 'partner' as const, label: partner.displayName.split(' ')[0] }] : []),
  ];

  const assigneeIdFor = (choice: AssigneeChoice): string | null => {
    if (choice === 'me') return user?.id ?? null;
    if (choice === 'partner') return partner?.userId ?? null;
    return null;
  };

  const assigneeLabel = (task: Task) => {
    if (task.assigneeId === null) return t('common.both');
    if (task.assigneeId === user?.id) return t('common.me');
    return partner && task.assigneeId === partner.userId ? partner.displayName.split(' ')[0] : t('common.partner');
  };

  const addTask = async () => {
    const trimmed = title.trim();
    if (!trimmed || !ctx) return;

    let dueIso: string | null = null;
    if (dueDate.trim()) {
      const parsed = parseLocalDateTime(dueDate, '23:59');
      if (!parsed) {
        Alert.alert(t('household.checkDueDate'), t('household.dueDateHint'));
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
      Alert.alert(t('household.couldNotAdd'), err instanceof Error ? err.message : t('common.tryAgain'));
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
    Alert.alert(t('household.deleteTitle'), t('household.deleteBody', { title: task.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => deleteRecord('tasks', task.id) },
    ]);
  };

  return (
    <ScreenScaffold eyebrow={t('household.eyebrow')} title={t('household.title')} right={<SyncBadge />}>
      <Card>
        <SectionLabel>{t('household.newTask')}</SectionLabel>
        <TextField
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={addTask}
          placeholder={t('household.taskPlaceholder')}
          maxLength={255}
          returnKeyType="done"
        />
        <View className="mt-3">
          <TextField value={dueDate} onChangeText={setDueDate} placeholder={t('household.duePlaceholder')} maxLength={10} />
        </View>
        <Text className="text-sm font-semibold text-ink-muted mt-4 mb-1.5">{t('household.who')}</Text>
        <Segmented<AssigneeChoice> value={assignee} onChange={setAssignee} options={assigneeOptions} />
        <Text className="text-sm font-semibold text-ink-muted mt-4 mb-1.5">{t('household.visibility')}</Text>
        <Segmented<Visibility>
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'shared', label: t('common.bothOfUs') },
            { value: 'personal', label: t('common.onlyMe') },
          ]}
        />
        <View className="mt-4">
          <Button label={t('household.addTask')} onPress={addTask} disabled={!title.trim()} />
        </View>
      </Card>

      <Card>
        <SectionLabel right={<Text className="text-sm text-ink-muted">{t('household.open', { count: open.length })}</Text>}>{t('household.todo')}</SectionLabel>
        {open.length === 0 ? <EmptyState message={t('household.allCaughtUp')} /> : null}
        {open.map((task, index) => (
          <View key={task.id}>
            {index > 0 ? <View className="h-px bg-border my-3" /> : null}
            <View className="flex-row items-center">
              <Checkbox checked={false} onToggle={() => toggle(task)} label={t('household.complete', { title: task.title })} />
              <View className="flex-1 mr-2" accessibilityHint={t('household.longPressToDelete')}>
                <Text
                  className="text-base font-medium text-ink"
                  numberOfLines={2}
                  onLongPress={() => confirmDelete(task)}
                >
                  {task.title}
                </Text>
                {task.dueDate ? (
                  <Text className="text-sm text-ink-muted mt-0.5">
                    {t('household.due', { day: format.dayLabel(new Date(task.dueDate), new Date()) })}
                  </Text>
                ) : null}
              </View>
              <View className="flex-row items-center gap-1.5">
                {task.visibility === 'personal' ? <Pill label={t('common.personal')} tone="personal" /> : null}
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
              <Button label={showDone ? t('common.hide') : t('household.show', { count: done.length })} variant="ghost" small onPress={() => setShowDone((v) => !v)} />
            }
          >
            {t('household.done')}
          </SectionLabel>
          {showDone
            ? done.slice(0, 20).map((task, index) => (
                <View key={task.id}>
                  {index > 0 ? <View className="h-px bg-border my-3" /> : null}
                  <View className="flex-row items-center">
                    <Checkbox checked onToggle={() => toggle(task)} label={t('household.reopen', { title: task.title })} />
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
