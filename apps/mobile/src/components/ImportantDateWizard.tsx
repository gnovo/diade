import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  IMPORTANT_DATE_TYPE_RULES,
  daysBetween,
  parseDateOnly,
  toDateInputValue,
  type ImportantDate,
  type ImportantDateRepeat,
  type ImportantDateType,
} from '@diade/domain';
import { insertRecord, updateRecord } from '../data/repository';
import {
  ALERT_OPTIONS,
  IMPORTANT_DATE_TYPE_ICONS,
  composeTitle,
  importantDateTypeLabel,
} from '../data/importantDateDisplay';
import { useFormat } from '../i18n';
import { Icon, useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { DateField } from './DateField';
import { FoldingFooter, StepPager, StepProgress } from './StepPager';
import { Button, Segmented, TextField, useWriteContext } from './ui';

/** Shown in this order: couple, birthdays, then trips and anything else. */
const WIZARD_TYPES: readonly ImportantDateType[] = [
  'first_day',
  'first_kiss',
  'engagement',
  'wedding',
  'expecting_baby',
  'my_birthday',
  'partner_birthday',
  'their_birthday',
  'trip',
  'other_anniversary',
  'other',
];

const TOTAL_STEPS = 3;
/** Room for the pinned button: 8 above, 48 high, 16 below. */
const FOOTER_HEIGHT = 72;
/** Long enough to see which tile was chosen, short enough to feel automatic. */
const ADVANCE_MS = 260;

type Step = 1 | 2 | 3;

const TypeTile: React.FC<{ type: ImportantDateType; selected: boolean; onPress: () => void }> = ({
  type,
  selected,
  onPress,
}) => {
  const { t } = useTranslation();
  const onAction = useColor('on-action');
  const ink = useColor('ink');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{ width: '48.5%' }}
      className={`flex-row items-center gap-2 min-h-[52px] px-3 rounded-lg border ${
        selected ? 'bg-action border-action' : 'bg-surface border-border-strong active:bg-surface-sunken'
      }`}
    >
      <Icon name={IMPORTANT_DATE_TYPE_ICONS[type]} size={18} color={selected ? onAction : ink} />
      <Text
        className={`flex-1 text-sm leading-5 font-semibold ${selected ? 'text-on-action' : 'text-ink'}`}
        numberOfLines={2}
      >
        {importantDateTypeLabel(t, type)}
      </Text>
    </Pressable>
  );
};

/**
 * Adds a date in three steps inside a bottom sheet: type, date, details. Choosing a type
 * moves on by itself. The type decides what the last step asks for, so a birthday never
 * offers a Repeat choice and a date about someone else asks for their name, not a title.
 */
export const ImportantDateWizard: React.FC<{
  visible: boolean;
  onClose: () => void;
  /** The date currently featured, so featuring this one can say what it replaces. */
  pinnedItem: ImportantDate | null;
}> = ({ visible, onClose, pinnedItem }) => {
  const { t } = useTranslation();
  const format = useFormat();
  const ctx = useWriteContext();
  const inkMuted = useColor('ink-muted');
  const ink = useColor('ink');

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<ImportantDateType | null>(null);
  const [date, setDate] = useState(() => toDateInputValue(new Date()));
  const [title, setTitle] = useState('');
  const [personName, setPersonName] = useState('');
  const [repeat, setRepeat] = useState<ImportantDateRepeat>('yearly');
  const [countFirstDay, setCountFirstDay] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [alert, setAlert] = useState('none');
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  // Reset after the sheet has finished closing, so opening costs no extra render.
  const reset = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    setStep(1);
    setType(null);
    setDate(toDateInputValue(new Date()));
    setTitle('');
    setPersonName('');
    setRepeat('yearly');
    setCountFirstDay(false);
    setPinned(false);
    setAlert('none');
    setMoreOpen(false);
    setSaving(false);
  };

  const rules = type ? IMPORTANT_DATE_TYPE_RULES[type] : null;

  const chooseType = (next: ImportantDateType) => {
    if (advanceTimer.current) return; // a second tap while advancing
    const nextRules = IMPORTANT_DATE_TYPE_RULES[next];
    setType(next);
    setRepeat(nextRules.repeat);
    setCountFirstDay(nextRules.countFirstDayDefault);
    setPinned(false);
    setPersonName('');
    // A named type suggests its own title; trips and "something else" start empty.
    setTitle(next === 'trip' || next === 'other' || nextRules.needsPersonName ? '' : importantDateTypeLabel(t, next));
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      setStep(2);
    }, ADVANCE_MS);
  };

  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const original = parseDateOnly(date);
  const today = new Date();
  const dayDiff = original ? daysBetween(original, today) : 0;
  const dateHint = !original
    ? ''
    : dayDiff === 0
      ? t('importantDates.wizard.today')
      : dayDiff > 0
        ? t('importantDates.wizard.daysAgo', { count: dayDiff })
        : t('importantDates.wizard.daysAhead', { count: -dayDiff });

  const canSave =
    Boolean(ctx) &&
    Boolean(type) &&
    Boolean(original) &&
    !saving &&
    (rules?.needsPersonName ? personName.trim().length > 0 : title.trim().length > 0);

  const handleSave = async () => {
    if (!ctx || !type || !rules || !canSave) return;
    const fields = {
      title: composeTitle(t, type, { title, personName }),
      type,
      notes: null,
      personName: rules.needsPersonName ? personName.trim() : null,
      date,
      countFirstDay: rules.countFirstDayOption ? countFirstDay : false,
      repeat: rules.repeatEditable ? repeat : rules.repeat,
      pinned: rules.pinnable ? pinned : false,
      alertOffsetDays: ALERT_OPTIONS.find((o) => o.value === alert)?.days ?? null,
    };
    try {
      setSaving(true);
      // Only one date can be featured: un-pin the current one first so this device never shows two.
      if (fields.pinned && pinnedItem) await updateRecord('important_dates', pinnedItem.id, { pinned: false });
      await insertRecord('important_dates', ctx, fields);
      onClose();
    } catch (err) {
      setSaving(false);
      Alert.alert(t('common.couldNotSave'), err instanceof Error ? err.message : t('common.tryAgain'));
    }
  };

  const progress = (
    <View className="mb-5">
      <View className="flex-row items-center justify-between mb-3 min-h-[32px]">
        {step > 1 ? (
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel={t('importantDates.wizard.back')}
            hitSlop={8}
            className="flex-row items-center -ml-1 active:opacity-70"
          >
            <Icon name="chevron-left" size={20} color={ink} />
            <Text className="text-sm font-semibold text-ink">{type ? importantDateTypeLabel(t, type) : ''}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <Text className="text-xs text-ink-muted">{t('importantDates.wizard.step', { step, total: TOTAL_STEPS })}</Text>
      </View>
      <StepProgress step={step} total={TOTAL_STEPS} />
    </View>
  );

  const replacing = pinned && pinnedItem ? pinnedItem : null;

  const typeStep = (
    <>
      <Text className="text-title-2 font-bold text-ink mb-4">{t('importantDates.wizard.typeHeading')}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {WIZARD_TYPES.map((value) => (
          <TypeTile key={value} type={value} selected={value === type} onPress={() => chooseType(value)} />
        ))}
      </View>
    </>
  );

  const dateStep = (
    <>
      <Text className="text-title-2 font-bold text-ink mb-4">{t('importantDates.wizard.dateHeading')}</Text>
      <DateField label={t('importantDates.form.date')} value={date} onChange={setDate} />
      {dateHint ? <Text className="text-sm text-ink-muted mt-3 text-center">{dateHint}</Text> : null}
    </>
  );

  const detailsStep = rules ? (
    <>
      <Text className="text-title-2 font-bold text-ink mb-4">
        {t(rules.needsPersonName ? 'importantDates.wizard.whoHeading' : 'importantDates.wizard.nameItHeading')}
      </Text>

      {rules.needsPersonName ? (
        <View className="mb-4">
          <Text className="text-sm font-semibold text-ink-muted mb-1.5">{t('importantDates.wizard.nameLabel')}</Text>
          <TextField
            value={personName}
            onChangeText={setPersonName}
            placeholder={t('importantDates.wizard.namePlaceholder')}
            maxLength={120}
            autoCapitalize="words"
            returnKeyType="done"
          />
          {personName.trim() && type ? (
            <Text className="text-sm text-ink-muted mt-1.5">
              {t('importantDates.wizard.shownAs', { title: composeTitle(t, type, { title, personName }) })}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="mb-4">
          <Text className="text-sm font-semibold text-ink-muted mb-1.5">{t('importantDates.wizard.titleLabel')}</Text>
          <TextField
            value={title}
            onChangeText={setTitle}
            placeholder={t('importantDates.form.titlePlaceholder')}
            maxLength={200}
            returnKeyType="done"
          />
        </View>
      )}

      <Pressable
        onPress={() => setStep(2)}
        accessibilityRole="button"
        accessibilityLabel={`${t('importantDates.wizard.editDate')}, ${original ? format.longDate(original) : date}`}
        className="flex-row items-center justify-between min-h-[56px] px-4 rounded-lg border border-border bg-surface mb-3 active:opacity-70"
      >
        <Text className="flex-1 text-base text-ink mr-3">
          {original ? format.longDate(original) : date}
          {(rules.repeatEditable ? repeat : rules.repeat) === 'yearly' ? ` · ${t('us.everyYear')}` : ''}
        </Text>
        <Text className="text-sm font-semibold text-action">{t('importantDates.wizard.editDate')}</Text>
      </Pressable>

      <Pressable
        onPress={() => setMoreOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: moreOpen }}
        className="flex-row items-center justify-between min-h-[56px] px-4 rounded-lg border border-border bg-surface active:opacity-70"
      >
        <View className="flex-1 mr-3">
          <Text className="text-base font-semibold text-ink">{t('importantDates.wizard.moreOptions')}</Text>
          {!moreOpen ? (
            <Text className="text-xs text-ink-muted mt-0.5">{t('importantDates.wizard.moreOptionsHint')}</Text>
          ) : null}
        </View>
        <Icon name={moreOpen ? 'chevron-up' : 'chevron-down'} size={20} color={inkMuted} />
      </Pressable>

      {moreOpen ? (
        <View className="mt-4 gap-5">
          {rules.repeatEditable ? (
            <View>
              <Text className="text-sm font-semibold text-ink-muted mb-1.5">{t('importantDates.form.repeat')}</Text>
              <Segmented<ImportantDateRepeat>
                value={repeat}
                onChange={setRepeat}
                options={[
                  { value: 'yearly', label: t('importantDates.form.everyYear') },
                  { value: 'none', label: t('common.never') },
                ]}
              />
            </View>
          ) : null}

          {rules.countFirstDayOption ? (
            <View className="flex-row items-center justify-between">
              <Text className="flex-1 mr-3 text-base font-medium text-ink">{t('importantDates.form.countFirstDay')}</Text>
              <Switch value={countFirstDay} onValueChange={setCountFirstDay} />
            </View>
          ) : null}

          {rules.pinnable ? (
            <View>
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 mr-3 text-base font-medium text-ink">{t('importantDates.form.feature')}</Text>
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
            <Text className="text-sm font-semibold text-ink-muted mb-1.5">{t('importantDates.form.alert')}</Text>
            <Segmented<string>
              value={alert}
              onChange={setAlert}
              options={ALERT_OPTIONS.map(({ value, labelKey }) => ({ value, label: t(labelKey) }))}
            />
            <Text className="text-sm leading-5 text-ink-muted mt-2">{t('importantDates.form.alertHint')}</Text>
          </View>
        </View>
      ) : null}
    </>
  ) : null;

  const footer = (
    <FoldingFooter open={step > 1} height={FOOTER_HEIGHT}>
      <View className="px-4 pt-2 pb-4">
        {step === 3 ? (
          <Button label={t('importantDates.wizard.save')} onPress={handleSave} disabled={!canSave} />
        ) : (
          <Button label={t('importantDates.wizard.continue')} onPress={() => setStep(3)} disabled={!original} />
        )}
      </View>
    </FoldingFooter>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={reset}
      title={t('importantDates.wizard.title')}
      footer={footer}
      bareFooter
    >
      {progress}
      <StepPager index={step - 1} steps={[typeStep, dateStep, detailsStep]} />
    </BottomSheet>
  );
};
