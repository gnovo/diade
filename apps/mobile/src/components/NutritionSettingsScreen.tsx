import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  type BodyFacts,
  formatNumber,
  isValidTargets,
  type NutritionTargets,
  suggestTargets,
} from '@diade/domain';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNutrition } from '../context/NutritionContext';
import { Icon, useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { decimalFor } from './RecipeForm';
import { Button, Card, SectionLabel, Segmented, TextField } from './ui';

/** A whole or decimal number as typed (a comma works); NaN when it is not one, null when empty. */
function parseNumber(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

interface Draft {
  kcal: string;
  protein: string;
  /** Litres, as people think of water; stored as ml. */
  waterL: string;
  flex: string;
}

const toDraft = (targets: NutritionTargets | null, decimal: string): Draft => ({
  kcal: targets ? String(targets.kcal) : '',
  protein: targets ? String(targets.protein) : '',
  waterL: targets ? formatNumber(targets.waterMl / 1000, decimal) : '',
  flex: targets ? String(targets.flexKcalPerWeek) : '',
});

function fromDraft(draft: Draft): NutritionTargets | null {
  const kcal = parseNumber(draft.kcal);
  const protein = parseNumber(draft.protein);
  const water = parseNumber(draft.waterL);
  const flex = parseNumber(draft.flex);
  if (kcal === null || protein === null || water === null || flex === null) return null;
  const targets = {
    kcal,
    protein,
    waterMl: Math.round(water * 1000),
    flexKcalPerWeek: flex,
  };
  return isValidTargets(targets) ? targets : null;
}

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (text: string) => void;
  hint?: string;
}> = ({ label, value, onChange, hint }) => (
  <View className="mb-4">
    <Text className="text-sm text-ink-muted mb-1">{label}</Text>
    <TextField
      value={value}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      accessibilityLabel={label}
    />
    {hint ? <Text className="text-xs leading-4 text-ink-muted mt-1">{hint}</Text> : null}
  </View>
);

/** Age, height, weight, sex and activity, once: they become targets and are not kept. */
const WorkOutSheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  onUse: (targets: NutritionTargets) => void;
}> = ({ visible, onClose, onUse }) => {
  const { t } = useTranslation();
  const [age, setAge] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [sex, setSex] = useState<BodyFacts['sex']>('male');
  const [activity, setActivity] = useState<ActivityLevel>('sedentary');

  const use = () => {
    const a = parseNumber(age);
    const h = parseNumber(height);
    const w = parseNumber(weight);
    const ok =
      a !== null &&
      h !== null &&
      w !== null &&
      a >= 16 &&
      a <= 100 &&
      h >= 120 &&
      h <= 230 &&
      w >= 35 &&
      w <= 300;
    if (!ok) {
      Alert.alert(t('nutrition.workOut.invalidTitle'), t('nutrition.workOut.invalid'));
      return;
    }
    onUse(suggestTargets({ age: a, heightCm: h, weightKg: w, sex, activity }));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('nutrition.workOut.title')}
      footer={<Button label={t('nutrition.workOut.use')} onPress={use} />}
    >
      <Field label={t('nutrition.workOut.age')} value={age} onChange={setAge} />
      <Field label={t('nutrition.workOut.height')} value={height} onChange={setHeight} />
      <Field label={t('nutrition.workOut.weight')} value={weight} onChange={setWeight} />
      <Text className="text-sm text-ink-muted mb-1">{t('nutrition.workOut.sex')}</Text>
      <Segmented<BodyFacts['sex']>
        value={sex}
        onChange={setSex}
        options={[
          { value: 'male', label: t('nutrition.workOut.male') },
          { value: 'female', label: t('nutrition.workOut.female') },
        ]}
      />
      <Text className="text-sm text-ink-muted mt-4 mb-1">{t('nutrition.workOut.activity')}</Text>
      <View className="gap-2">
        {ACTIVITY_LEVELS.map((level) => {
          const selected = level === activity;
          return (
            <Pressable
              key={level}
              onPress={() => setActivity(level)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`rounded-md border px-3 py-2.5 ${selected ? 'border-action bg-surface-tint' : 'border-border-strong'}`}
            >
              <Text className="text-base font-semibold text-ink">
                {t(`nutrition.workOut.activities.${level}`)}
              </Text>
              <Text className="text-xs leading-4 text-ink-muted mt-0.5">
                {t(`nutrition.workOut.activityHints.${level}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="text-xs leading-4 text-ink-muted mt-4">
        {t('nutrition.workOut.notKept')}
      </Text>
    </BottomSheet>
  );
};

/**
 * Profile → Nutrition: whether this member sees targets, and the targets themselves. Per member and off by
 * default; the partner never sees them. Saving needs a connection.
 */
export const NutritionSettingsScreen: React.FC<{ visible: boolean; onClose: () => void }> = ({
  visible,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const { settings, update } = useNutrition();
  const track = useColor('border-strong');
  const on = useColor('action');
  const [enabled, setEnabled] = useState(settings.enabled);
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings.targets, decimal));
  const [workOutOpen, setWorkOutOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openedWith, setOpenedWith] = useState<typeof settings | null>(null);
  // Start from the saved settings each time the screen opens.
  if (visible && openedWith !== settings) {
    setOpenedWith(settings);
    setEnabled(settings.enabled);
    setDraft(toDraft(settings.targets, decimal));
  }
  const set = (field: keyof Draft) => (text: string) => setDraft((d) => ({ ...d, [field]: text }));

  const save = async () => {
    const targets = fromDraft(draft);
    const empty = Object.values(draft).every((v) => !v.trim());
    if (!targets && !(empty && !enabled)) {
      Alert.alert(t('nutrition.invalidTitle'), t('nutrition.invalid'));
      return;
    }
    setSaving(true);
    try {
      await update({ enabled, ...(targets ? { targets } : {}) });
      setOpenedWith(null);
      onClose();
    } catch (err) {
      Alert.alert(
        t('common.couldNotSave'),
        err instanceof Error ? err.message : t('common.checkConnection'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
        <View className="flex-row items-center px-4 pt-2 pb-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('nutrition.close')}
            hitSlop={8}
            className="w-11 h-11 rounded-full bg-surface-sunken items-center justify-center mr-3"
          >
            <Icon name="x" />
          </Pressable>
          <Text className="flex-1 text-title-2 font-bold text-ink">{t('nutrition.title')}</Text>
        </View>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <View className="flex-row items-center">
              <View className="flex-1 mr-3">
                <Text className="text-base font-semibold text-ink">{t('nutrition.show')}</Text>
                <Text className="text-sm leading-5 text-ink-muted mt-0.5">
                  {t('nutrition.showHint')}
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={(value) => {
                  setEnabled(value);
                  // Nothing to show without targets: offer to work them out straight away.
                  if (value && !fromDraft(draft)) setWorkOutOpen(true);
                }}
                accessibilityLabel={t('nutrition.show')}
                trackColor={{ false: track, true: on }}
              />
            </View>
          </Card>

          <SectionLabel>{t('nutrition.daily')}</SectionLabel>
          <Field label={t('nutrition.kcal')} value={draft.kcal} onChange={set('kcal')} />
          <Field label={t('nutrition.protein')} value={draft.protein} onChange={set('protein')} />
          <Field
            label={t('nutrition.water')}
            value={draft.waterL}
            onChange={set('waterL')}
            hint={t('nutrition.waterHint')}
          />
          <SectionLabel>{t('nutrition.weekly')}</SectionLabel>
          <Field
            label={t('nutrition.flex')}
            value={draft.flex}
            onChange={set('flex')}
            hint={t('nutrition.flexHint')}
          />
          <Button
            label={t('nutrition.workOut.open')}
            variant="outline"
            onPress={() => setWorkOutOpen(true)}
          />
          <Text className="text-xs leading-4 text-ink-muted mt-3 mb-6">
            {t('nutrition.disclaimer')}
          </Text>
          <Button label={t('common.save')} onPress={save} disabled={saving} />
        </ScrollView>
        <WorkOutSheet
          visible={workOutOpen}
          onClose={() => setWorkOutOpen(false)}
          onUse={(targets) => {
            setDraft(toDraft(targets, decimal));
            setWorkOutOpen(false);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
};
