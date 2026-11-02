import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, Switch, Alert, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  IMPORTANT_DATE_TYPES,
  parseDateOnly,
  toDateInputValue,
  type ImportantDate,
  type ImportantDateRepeat,
  type ImportantDateType,
} from '@diade/domain';
import { insertRecord, updateRecord, deleteRecord } from '../data/repository';
import {
  ALERT_OPTIONS,
  IMPORTANT_DATE_TYPE_META,
  alertToOption,
} from '../data/importantDateDisplay';
import { Icon, useColor } from '../design';
import { Button, Pill, Segmented, TextField, useWriteContext } from './ui';
import { DateField } from './DateField';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When provided the form edits this date; otherwise it creates one. */
  item?: ImportantDate | null;
  /** The date currently featured, if any, so pinning another can say what it replaces. */
  pinnedItem?: ImportantDate | null;
}

type Fields = Pick<
  ImportantDate,
  'title' | 'type' | 'date' | 'countFirstDay' | 'repeat' | 'pinned' | 'alertOffsetDays' | 'notes'
>;

const REPEAT_OPTIONS: Array<{ value: ImportantDateRepeat; label: string }> = [
  { value: 'yearly', label: 'Every year' },
  { value: 'none', label: 'Never' },
];

const TypeChip: React.FC<{ type: ImportantDateType; selected: boolean; onPress: () => void }> = ({
  type,
  selected,
  onPress,
}) => {
  const onAction = useColor('on-action');
  const ink = useColor('ink');
  const meta = IMPORTANT_DATE_TYPE_META[type];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-2 min-h-[44px] px-3 rounded-full border ${
        selected ? 'bg-action border-action' : 'bg-surface border-border-strong'
      }`}
    >
      <Icon name={meta.icon} size={16} color={selected ? onAction : ink} />
      <Text className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink'}`}>
        {meta.label}
      </Text>
    </Pressable>
  );
};

export const ImportantDateForm: React.FC<Props> = ({ visible, onClose, item, pinnedItem }) => {
  const ctx = useWriteContext();
  const editing = Boolean(item);

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ImportantDateType>('other');
  const [date, setDate] = useState('');
  const [countFirstDay, setCountFirstDay] = useState(false);
  const [repeat, setRepeat] = useState<ImportantDateRepeat>('yearly');
  const [pinned, setPinned] = useState(false);
  const [alert, setAlert] = useState('none');
  const [notes, setNotes] = useState('');
  // Tracks whether the title still equals the last type-suggested name, so picking a type
  // fills an empty title but never overwrites something the member typed.
  const [titleIsSuggested, setTitleIsSuggested] = useState(true);
  const [saving, setSaving] = useState(false);

  // Reset each time the form opens so a previous draft never leaks into a new date.
  useEffect(() => {
    if (!visible) return;
    if (item) {
      setTitle(item.title);
      setType(item.type);
      setDate(item.date);
      setCountFirstDay(item.countFirstDay);
      setRepeat(item.repeat);
      setPinned(item.pinned);
      setAlert(alertToOption(item.alertOffsetDays));
      setNotes(item.notes ?? '');
      setTitleIsSuggested(false);
    } else {
      setTitle('');
      setType('other');
      setDate(toDateInputValue(new Date()));
      setCountFirstDay(false);
      setRepeat('yearly');
      setPinned(false);
      setAlert('none');
      setNotes('');
      setTitleIsSuggested(true);
    }
  }, [visible, item]);

  const chooseType = (next: ImportantDateType) => {
    setType(next);
    if (titleIsSuggested || !title.trim()) {
      setTitle(next === 'other' ? '' : IMPORTANT_DATE_TYPE_META[next].label);
      setTitleIsSuggested(true);
    }
  };

  const handleSave = async () => {
    if (!ctx) return;
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Add a title', 'Give this special day a name.');
      return;
    }
    if (!parseDateOnly(date)) {
      Alert.alert('Check the date', 'Pick a valid date.');
      return;
    }

    const next: Fields = {
      title: trimmed,
      type,
      date,
      countFirstDay,
      repeat,
      pinned,
      alertOffsetDays: ALERT_OPTIONS.find((o) => o.value === alert)?.days ?? null,
      notes: notes.trim() || null,
    };

    try {
      setSaving(true);
      // Only one date can be featured. Un-pin the current one first so this device
      // never shows two, whatever order the server applies the changes in.
      if (next.pinned && pinnedItem && pinnedItem.id !== item?.id) {
        await updateRecord('important_dates', pinnedItem.id, { pinned: false });
      }

      if (item) {
        // Send only what changed so a partner's concurrent edit to another field survives.
        const changes = (Object.keys(next) as Array<keyof Fields>).filter((key) => next[key] !== item[key]);
        if (changes.length > 0) {
          await updateRecord(
            'important_dates',
            item.id,
            Object.fromEntries(changes.map((key) => [key, next[key]])),
          );
        }
      } else {
        await insertRecord('important_dates', ctx, next);
      }
      onClose();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert('Delete this special day?', `"${item.title}" will be removed for both of you.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRecord('important_dates', item.id);
          onClose();
        },
      },
    ]);
  };

  const replacing = pinned && pinnedItem && pinnedItem.id !== item?.id ? pinnedItem : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border bg-surface">
            <Button label="Cancel" variant="ghost" small onPress={onClose} />
            <Text className="text-base font-semibold text-ink">{editing ? 'Edit special day' : 'New special day'}</Text>
            <Button label="Save" small onPress={handleSave} disabled={saving || !ctx} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
            <View className="items-start">
              <Pill label="Shared with both of you" tone="shared" />
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-2">Type</Text>
              <View className="flex-row flex-wrap gap-2">
                {IMPORTANT_DATE_TYPES.map((value) => (
                  <TypeChip key={value} type={value} selected={value === type} onPress={() => chooseType(value)} />
                ))}
              </View>
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Title</Text>
              <TextField
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  setTitleIsSuggested(false);
                }}
                placeholder="First trip to Porto"
                maxLength={200}
              />
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Date</Text>
              <DateField label="Date" value={date} onChange={setDate} />
            </View>

            <View>
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 mr-3 text-base font-medium text-ink">Count this day as the first day</Text>
                <Switch value={countFirstDay} onValueChange={setCountFirstDay} />
              </View>
              <Text className="text-sm leading-5 text-ink-muted mt-1">
                Day 1 instead of day 0, so the day itself is included in the count.
              </Text>
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Repeat</Text>
              <Segmented<ImportantDateRepeat> value={repeat} onChange={setRepeat} options={REPEAT_OPTIONS} />
            </View>

            <View>
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 mr-3 text-base font-medium text-ink">Feature at the top and on Today</Text>
                <Switch value={pinned} onValueChange={setPinned} />
              </View>
              {replacing ? (
                <Text className="text-sm leading-5 text-ink-muted mt-1">
                  Replaces "{replacing.title}", only one date can be featured.
                </Text>
              ) : null}
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Alert</Text>
              <Segmented<string>
                value={alert}
                onChange={setAlert}
                options={ALERT_OPTIONS.map(({ value, label }) => ({ value, label }))}
              />
              <Text className="text-sm leading-5 text-ink-muted mt-2">
                Reminders aren't sent yet. Your choice is saved with the date for when they are.
              </Text>
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">Notes</Text>
              <TextField
                value={notes}
                onChangeText={setNotes}
                placeholder="Anything worth remembering"
                multiline
                maxLength={2000}
                style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
              />
            </View>

            {editing ? <Button label="Delete special day" variant="danger" onPress={handleDelete} /> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};
