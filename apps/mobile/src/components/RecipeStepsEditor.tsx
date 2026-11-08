import { cleanStep, MAX_STEP_LENGTH } from '@diade/domain';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../design';
import { Button, Card, SectionLabel, TextField } from './ui';

/** The steps with whatever is still in the box applied: added, or written over the step being edited. */
export function stepsWithDraft(steps: string[], editing: number | null, draft: string): string[] {
  const text = cleanStep(draft);
  if (!text) return steps;
  return editing === null
    ? [...steps, text]
    : steps.map((step, i) => (i === editing ? text : step));
}

/**
 * The steps of a recipe: add one at a time, tap a step to edit it, move it or remove it. `draft` is the step
 * being typed; the form keeps it so a step still in the box is saved with the recipe.
 */
export const RecipeStepsEditor: React.FC<{
  steps: string[];
  onChange: (steps: string[]) => void;
  draft: string;
  onDraftChange: (text: string) => void;
  /** The step being edited, or null when the box adds a new one. */
  editing: number | null;
  onEditingChange: (index: number | null) => void;
}> = ({ steps, onChange, draft, onDraftChange, editing, onEditingChange }) => {
  const { t } = useTranslation();
  const setEditing = onEditingChange;

  const submit = () => {
    if (!cleanStep(draft)) return;
    onChange(stepsWithDraft(steps, editing, draft));
    onDraftChange('');
    setEditing(null);
  };

  const startEditing = (index: number) => {
    setEditing(index);
    onDraftChange(steps[index]);
  };

  const cancel = () => {
    setEditing(null);
    onDraftChange('');
  };

  const move = (by: -1 | 1) => {
    if (editing === null) return;
    const to = editing + by;
    if (to < 0 || to >= steps.length) return;
    const next = [...steps];
    [next[editing], next[to]] = [next[to], next[editing]];
    onChange(next);
    setEditing(to);
  };

  const remove = () => {
    if (editing === null) return;
    onChange(steps.filter((_, i) => i !== editing));
    cancel();
  };

  // Steps are plain text, so a key is the text plus how many identical steps came before it.
  const seen = new Map<string, number>();
  const keyed = steps.map((step) => {
    const count = seen.get(step) ?? 0;
    seen.set(step, count + 1);
    return { step, key: `${step}#${count}` };
  });

  return (
    <View>
      <SectionLabel>{t('recipes.form.steps')}</SectionLabel>
      <TextField
        value={draft}
        onChangeText={onDraftChange}
        placeholder={
          editing === null ? t('recipes.form.stepPlaceholder') : t('recipes.form.updateStep')
        }
        accessibilityLabel={t('recipes.form.steps')}
        multiline
        maxLength={MAX_STEP_LENGTH}
        textAlignVertical="top"
        style={{ minHeight: 72, paddingTop: 12 }}
      />
      <View className="flex-row items-center mt-2">
        <Button
          label={editing === null ? t('recipes.form.addStep') : t('recipes.form.updateStep')}
          variant="outline"
          small
          onPress={submit}
          disabled={draft.trim().length === 0}
        />
        {editing !== null ? (
          <>
            <Pressable
              onPress={() => move(-1)}
              disabled={editing === 0}
              accessibilityRole="button"
              accessibilityLabel={t('recipes.form.moveStepUp', { n: editing + 1 })}
              className={`w-12 h-12 items-center justify-center ml-1 ${editing === 0 ? 'opacity-40' : ''}`}
            >
              <Icon name="chevron-up" size={20} />
            </Pressable>
            <Pressable
              onPress={() => move(1)}
              disabled={editing === steps.length - 1}
              accessibilityRole="button"
              accessibilityLabel={t('recipes.form.moveStepDown', { n: editing + 1 })}
              className={`w-12 h-12 items-center justify-center ${editing === steps.length - 1 ? 'opacity-40' : ''}`}
            >
              <Icon name="chevron-down" size={20} />
            </Pressable>
            <Button label={t('common.cancel')} variant="ghost" small onPress={cancel} />
            <Pressable
              onPress={remove}
              accessibilityRole="button"
              accessibilityLabel={t('recipes.form.removeStep', { n: editing + 1 })}
              className="w-12 h-12 items-center justify-center ml-auto"
            >
              <Icon name="x" size={18} />
            </Pressable>
          </>
        ) : null}
      </View>
      {steps.length > 0 ? (
        <Card className="mt-3 mb-0">
          {keyed.map(({ step, key }, index) => (
            <View key={key}>
              {index === 0 ? null : <View className="h-px bg-border" />}
              <Pressable
                onPress={() => startEditing(index)}
                accessibilityRole="button"
                accessibilityLabel={t('recipes.form.editStep', { n: index + 1 })}
                className={`flex-row items-start min-h-[52px] py-3 ${editing === index ? 'bg-surface-tint -mx-2 px-2 rounded-md' : ''}`}
              >
                <Text className="w-7 text-sm font-semibold text-ink-muted">{index + 1}.</Text>
                <Text className="flex-1 text-sm leading-5 text-ink">{step}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
};
