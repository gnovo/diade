import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Switch, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  parseLocalDateTime,
  toDateInputValue,
  toTimeInputValue,
  type CalendarEvent,
  type Visibility,
} from '@diade/domain';
import { insertRecord, updateRecord, deleteRecord } from '../data/repository';
import { Button, Segmented, TextField, useWriteContext } from './ui';

type Repeat = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

const REPEAT_OPTIONS: Array<{ value: Repeat; label: string }> = [
  { value: 'NONE', label: 'Never' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

interface EventFormProps {
  visible: boolean;
  onClose: () => void;
  /** When provided the form edits this event; otherwise it creates one. */
  event?: CalendarEvent | null;
}

function repeatFromRule(rule: string | null): Repeat {
  const match = /FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/i.exec(rule ?? '');
  return match ? (match[1].toUpperCase() as Repeat) : 'NONE';
}

export const EventForm: React.FC<EventFormProps> = ({ visible, onClose, event }) => {
  const ctx = useWriteContext();
  const editing = Boolean(event);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('20:00');
  const [isAllDay, setIsAllDay] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>('shared');
  const [repeat, setRepeat] = useState<Repeat>('NONE');
  const [saving, setSaving] = useState(false);

  // Reset the form each time it opens so a previous draft never leaks into a new event.
  useEffect(() => {
    if (!visible) return;
    if (event) {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);
      setTitle(event.title);
      setDate(toDateInputValue(start));
      setStartTime(toTimeInputValue(start));
      setEndTime(toTimeInputValue(end));
      setIsAllDay(event.isAllDay);
      setVisibility(event.visibility);
      setRepeat(repeatFromRule(event.recurrenceRule));
    } else {
      const next = new Date();
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      const end = new Date(next.getTime() + 60 * 60_000);
      setTitle('');
      setDate(toDateInputValue(next));
      setStartTime(toTimeInputValue(next));
      setEndTime(toTimeInputValue(end));
      setIsAllDay(false);
      setVisibility('shared');
      setRepeat('NONE');
    }
  }, [visible, event]);

  const handleSave = async () => {
    if (!ctx) return;
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Add a title', 'Give this event a name.');
      return;
    }

    const start = isAllDay
      ? parseLocalDateTime(date, '00:00')
      : parseLocalDateTime(date, startTime);
    const end = isAllDay ? parseLocalDateTime(date, '23:59') : parseLocalDateTime(date, endTime);
    if (!start || !end) {
      Alert.alert('Check the date and time', 'Use YYYY-MM-DD for the date and HH:MM (24h) for times.');
      return;
    }
    if (end.getTime() <= start.getTime()) {
      Alert.alert('Check the times', 'The end time must be after the start time.');
      return;
    }

    const payload = {
      title: trimmed,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      isAllDay,
      visibility,
      recurrenceRule: repeat === 'NONE' ? null : `FREQ=${repeat}`,
    };

    try {
      setSaving(true);
      if (event) {
        await updateRecord('events', event.id, payload);
      } else {
        await insertRecord('events', ctx, payload);
      }
      onClose();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!event) return;
    const seriesNote = event.recurrenceRule ? '\n\nThis removes the whole repeating series.' : '';
    Alert.alert('Delete this event?', `"${event.title}" will be removed for both of you.${seriesNote}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecord('events', event.id);
          onClose();
        },
      },
    ]);
  };

  const heading = editing ? 'Edit event' : 'New event';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border bg-surface">
            <Button label="Cancel" variant="ghost" small onPress={onClose} />
            <Text className="text-base font-semibold text-ink">{heading}</Text>
            <Button label="Save" small onPress={handleSave} disabled={saving || !ctx} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Title</Text>
              <TextField value={title} onChangeText={setTitle} placeholder="Anniversary dinner" maxLength={200} />
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Date (YYYY-MM-DD)</Text>
              <TextField value={date} onChangeText={setDate} placeholder="2026-11-14" keyboardType="numbers-and-punctuation" />
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-base font-medium text-ink">All day</Text>
              <Switch value={isAllDay} onValueChange={setIsAllDay} />
            </View>

            {!isAllDay ? (
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink-muted mb-1.5">Starts (HH:MM)</Text>
                  <TextField value={startTime} onChangeText={setStartTime} placeholder="19:30" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-ink-muted mb-1.5">Ends (HH:MM)</Text>
                  <TextField value={endTime} onChangeText={setEndTime} placeholder="21:00" />
                </View>
              </View>
            ) : null}

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Who sees it</Text>
              <Segmented<Visibility>
                value={visibility}
                onChange={setVisibility}
                options={[
                  { value: 'shared', label: 'Both of us' },
                  { value: 'personal', label: 'Only me' },
                ]}
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Repeats</Text>
              <Segmented<Repeat> value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
              {editing && event?.recurrenceRule ? (
                <Text className="text-sm text-ink-muted mt-2">Changes apply to the whole series.</Text>
              ) : null}
            </View>

            {editing ? (
              <Button label="Delete event" variant="danger" onPress={handleDelete} />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};
