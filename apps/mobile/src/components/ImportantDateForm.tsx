import {
  IMPORTANT_DATE_TYPE_RULES,
  IMPORTANT_DATE_TYPES,
  type ImportantDate,
  type ImportantDateRepeat,
  type ImportantDateType,
  parseDateOnly,
  toDateInputValue,
} from '@diade/domain';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ALERT_OPTIONS,
  alertToOption,
  composeTitle,
  IMPORTANT_DATE_TYPE_ICONS,
  importantDateTypeLabel,
} from '../data/importantDateDisplay';
import { deleteRecord, insertRecord, updateRecord } from '../data/repository';
import { Icon, useColor } from '../design';
import { DateField } from './DateField';
import { Button, Segmented, TextField, useWriteContext } from './ui';

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
  | 'title'
  | 'type'
  | 'personName'
  | 'date'
  | 'countFirstDay'
  | 'repeat'
  | 'pinned'
  | 'alertOffsetDays'
  | 'notes'
>;

const TypeChip: React.FC<{ type: ImportantDateType; selected: boolean; onPress: () => void }> = ({
  type,
  selected,
  onPress,
}) => {
  const onAction = useColor('on-action');
  const ink = useColor('ink');
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`flex-row items-center gap-2 min-h-[44px] px-3 rounded-full border ${
        selected ? 'bg-action border-action' : 'bg-surface border-border-strong'
      }`}
    >
      <Icon name={IMPORTANT_DATE_TYPE_ICONS[type]} size={16} color={selected ? onAction : ink} />
      <Text
        className={`text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink'}`}
      >
        {importantDateTypeLabel(t, type)}
      </Text>
    </Pressable>
  );
};

export const ImportantDateForm: React.FC<Props> = ({ visible, onClose, item, pinnedItem }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const editing = Boolean(item);

  const repeatOptions: Array<{ value: ImportantDateRepeat; label: string }> = [
    { value: 'yearly', label: t('importantDates.form.everyYear') },
    { value: 'none', label: t('common.never') },
  ];

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ImportantDateType>('other');
  const [personName, setPersonName] = useState('');
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
      setPersonName(item.personName ?? '');
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
      setPersonName('');
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
      setTitle(next === 'other' || next === 'trip' ? '' : importantDateTypeLabel(t, next));
      setTitleIsSuggested(true);
    }
    const nextRules = IMPORTANT_DATE_TYPE_RULES[next];
    if (!nextRules.repeatEditable) setRepeat(nextRules.repeat);
    if (!nextRules.pinnable) setPinned(false);
  };

  const handleSave = async () => {
    if (!ctx) return;
    const trimmed = composeTitle(t, type, { title, personName });
    if (!trimmed || (rules.needsPersonName && !personName.trim())) {
      Alert.alert(t('importantDates.form.addTitle'), t('importantDates.form.addTitleBody'));
      return;
    }
    if (!parseDateOnly(date)) {
      Alert.alert(t('importantDates.form.checkDate'), t('importantDates.form.checkDateBody'));
      return;
    }

    // Settings the form hides for this type keep an existing date's value (so editing a title never
    // changes how it repeats) and otherwise take the type's default.
    const sameType = item?.type === type;
    const next: Fields = {
      title: trimmed,
      type,
      personName: rules.needsPersonName ? personName.trim() : null,
      date,
      countFirstDay: rules.countFirstDayOption
        ? countFirstDay
        : sameType
          ? item.countFirstDay
          : false,
      repeat: rules.repeatEditable ? repeat : sameType ? item.repeat : rules.repeat,
      pinned: rules.pinnable ? pinned : false,
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
        const changes = (Object.keys(next) as Array<keyof Fields>).filter(
          (key) => next[key] !== item[key],
        );
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
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!item) return;
    Alert.alert(
      t('importantDates.form.deleteTitle'),
      t('importantDates.form.deleteBody', { title: item.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteRecord('important_dates', item.id);
            onClose();
          },
        },
      ],
    );
  };

  const rules = IMPORTANT_DATE_TYPE_RULES[type];
  const replacing = pinned && pinnedItem && pinnedItem.id !== item?.id ? pinnedItem : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-row items-center justify-between px-5 py-4 border-b border-border bg-surface">
            <Button label={t('common.cancel')} variant="ghost" small onPress={onClose} />
            <Text className="text-base font-semibold text-ink">
              {editing ? t('importantDates.form.editTitle') : t('importantDates.form.newTitle')}
            </Text>
            <Button label={t('common.save')} small onPress={handleSave} disabled={saving || !ctx} />
          </View>

          <ScrollView
            contentContainerStyle={{ padding: 20, gap: 20 }}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-2">
                {t('importantDates.form.type')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {IMPORTANT_DATE_TYPES.map((value) => (
                  <TypeChip
                    key={value}
                    type={value}
                    selected={value === type}
                    onPress={() => chooseType(value)}
                  />
                ))}
              </View>
            </View>

            {rules.needsPersonName ? (
              <View>
                <Text className="text-sm font-semibold text-ink-muted mb-1.5">
                  {t('importantDates.form.personName')}
                </Text>
                <TextField
                  value={personName}
                  onChangeText={setPersonName}
                  placeholder={t('importantDates.form.personNamePlaceholder')}
                  maxLength={120}
                  autoCapitalize="words"
                />
              </View>
            ) : (
              <View>
                <Text className="text-sm font-semibold text-ink-muted mb-1.5">
                  {t('importantDates.form.title')}
                </Text>
                <TextField
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    setTitleIsSuggested(false);
                  }}
                  placeholder={t('importantDates.form.titlePlaceholder')}
                  maxLength={200}
                />
              </View>
            )}

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">
                {t('importantDates.form.date')}
              </Text>
              <DateField label={t('importantDates.form.date')} value={date} onChange={setDate} />
            </View>

            {rules.countFirstDayOption ? (
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 mr-3 text-base font-medium text-ink">
                    {t('importantDates.form.countFirstDay')}
                  </Text>
                  <Switch value={countFirstDay} onValueChange={setCountFirstDay} />
                </View>
                <Text className="text-sm leading-5 text-ink-muted mt-1">
                  {t('importantDates.form.countFirstDayHint')}
                </Text>
              </View>
            ) : null}

            {rules.repeatEditable ? (
              <View>
                <Text className="text-sm font-semibold text-ink-muted mb-1.5">
                  {t('importantDates.form.repeat')}
                </Text>
                <Segmented<ImportantDateRepeat>
                  value={repeat}
                  onChange={setRepeat}
                  options={repeatOptions}
                />
              </View>
            ) : null}

            {rules.pinnable ? (
              <View>
                <View className="flex-row items-center justify-between">
                  <Text className="flex-1 mr-3 text-base font-medium text-ink">
                    {t('importantDates.form.feature')}
                  </Text>
                  <Switch value={pinned} onValueChange={setPinned} />
                </View>
                {replacing ? (
                  <Text className="text-sm leading-5 text-ink-muted mt-1">
                    {t('importantDates.form.replaces', { title: replacing.title })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">
                {t('importantDates.form.alert')}
              </Text>
              <Segmented<string>
                value={alert}
                onChange={setAlert}
                options={ALERT_OPTIONS.map(({ value, labelKey }) => ({
                  value,
                  label: t(labelKey),
                }))}
              />
              <Text className="text-sm leading-5 text-ink-muted mt-2">
                {t('importantDates.form.alertHint')}
              </Text>
            </View>

            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">
                {t('importantDates.form.notes')}
              </Text>
              <TextField
                value={notes}
                onChangeText={setNotes}
                placeholder={t('importantDates.form.notesPlaceholder')}
                multiline
                maxLength={2000}
                style={{ minHeight: 96, textAlignVertical: 'top', paddingTop: 12 }}
              />
            </View>

            {editing ? (
              <Button
                label={t('importantDates.form.delete')}
                variant="danger"
                onPress={handleDelete}
              />
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};
