import {
  DEFAULT_SERVINGS,
  formatAmount,
  formatIngredient,
  ingredientFromLine,
  isLikelyStaple,
  MAX_SERVINGS,
  MIN_SERVINGS,
  type Recipe,
  type RecipeIngredient,
} from '@diade/domain';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, type TextInput, View } from 'react-native';
import { newId } from '../data/ids';
import { insertRecord, updateRecord } from '../data/repository';
import { Icon, useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { Button, Card, SectionLabel, TextField, useWriteContext } from './ui';

/** The decimal separator a member of this language writes. */
export const decimalFor = (language: string): string => (language.startsWith('pt') ? ',' : '.');

export const Stepper: React.FC<{
  value: number;
  onChange: (next: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}> = ({ value, onChange, decreaseLabel, increaseLabel }) => {
  const ink = useColor('ink');
  const muted = useColor('ink-muted');
  const atMin = value <= MIN_SERVINGS;
  const atMax = value >= MAX_SERVINGS;
  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => onChange(value - 1)}
        disabled={atMin}
        accessibilityRole="button"
        accessibilityLabel={decreaseLabel}
        className="w-12 h-12 rounded-full border border-border-strong items-center justify-center active:bg-surface-sunken"
      >
        <Icon name="minus" color={atMin ? muted : ink} />
      </Pressable>
      <Text
        className="w-12 text-center text-lg font-semibold text-ink"
        accessibilityLiveRegion="polite"
      >
        {value}
      </Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityLabel={increaseLabel}
        className="w-12 h-12 rounded-full border border-border-strong items-center justify-center active:bg-surface-sunken"
      >
        <Icon name="plus" color={atMax ? muted : ink} />
      </Pressable>
    </View>
  );
};

const IngredientRow: React.FC<{
  ingredient: RecipeIngredient;
  first: boolean;
  decimal: string;
  editing: boolean;
  onEdit: () => void;
  onToggleStaple: () => void;
  onRemove: () => void;
}> = ({ ingredient, first, decimal, editing, onEdit, onToggleStaple, onRemove }) => {
  const { t } = useTranslation();
  const amount = formatAmount(ingredient.quantity, ingredient.unit, decimal);
  return (
    <View>
      {first ? null : <View className="h-px bg-border" />}
      <View
        className={`flex-row items-center min-h-[52px] ${editing ? 'bg-surface-tint -mx-2 px-2 rounded-md' : ''}`}
      >
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.form.editIngredient', {
            name: ingredient.name,
          })}
          className="flex-1 flex-row items-center min-h-[48px] mr-2"
        >
          <Text className="flex-1 text-sm font-medium text-ink mr-2">{ingredient.name}</Text>
          {amount ? <Text className="text-sm text-ink-muted">{amount}</Text> : null}
        </Pressable>
        <Pressable
          onPress={onToggleStaple}
          accessibilityRole="switch"
          accessibilityState={{ checked: ingredient.staple }}
          accessibilityLabel={t(
            ingredient.staple ? 'recipes.form.unmarkStaple' : 'recipes.form.markStaple',
            {
              name: ingredient.name,
            },
          )}
          className={`min-h-[48px] justify-center px-1`}
        >
          <View
            className={`px-2.5 py-1 rounded-full border ${
              ingredient.staple ? 'bg-surface-tint border-action' : 'border-border-strong'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${ingredient.staple ? 'text-action' : 'text-ink-muted'}`}
            >
              {t('recipes.form.pantry')}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.form.removeIngredient', {
            name: ingredient.name,
          })}
          hitSlop={4}
          className="w-12 h-12 items-center justify-center"
        >
          <Icon name="x" size={18} />
        </Pressable>
      </View>
    </View>
  );
};

/** Create or edit a recipe: name, servings, ingredients typed one per line, notes. */
export const RecipeForm: React.FC<{
  visible: boolean;
  onClose: () => void;
  /** The recipe being edited; null creates a new one. */
  recipe: Recipe | null;
  /** Called with the id of the recipe once it has been saved. */
  onSaved?: (id: string) => void;
}> = ({ visible, onClose, recipe, onSaved }) => {
  const { t, i18n } = useTranslation();
  const ctx = useWriteContext();
  const decimal = decimalFor(i18n.language);
  const editing = Boolean(recipe);

  const [name, setName] = useState('');
  const [servings, setServings] = useState(DEFAULT_SERVINGS);
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [line, setLine] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const lineRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  // Start from the recipe (or a blank one) each time the form opens, so a draft never leaks across.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Only `visible` starts a fresh form; the recipe is read at that moment
  useEffect(() => {
    if (!visible) return;
    setName(recipe?.name ?? '');
    setServings(recipe?.servings ?? DEFAULT_SERVINGS);
    setIngredients(recipe?.ingredients ?? []);
    setNotes(recipe?.notes ?? '');
    setLine('');
    setEditingId(null);
    setSaving(false);
    // Only `visible` starts a fresh form; the recipe is read at that moment.
  }, [visible]);

  const submitLine = () => {
    const id = editingId ?? newId();
    const next = ingredientFromLine(id, line);
    if (!next) return;
    setIngredients((rows) => {
      if (!editingId) return [...rows, next];
      return rows.map((row) => {
        if (row.id !== editingId) return row;
        // Keep what the member chose for the pantry flag unless the ingredient is now a different thing.
        const sameName = row.name.toLowerCase() === next.name.toLowerCase();
        return {
          ...next,
          staple: sameName ? row.staple : isLikelyStaple(next.name),
        };
      });
    });
    setLine('');
    setEditingId(null);
  };

  const startEditing = (row: RecipeIngredient) => {
    setEditingId(row.id);
    setLine(formatIngredient(row, decimal));
    lineRef.current?.focus();
  };

  const remove = (id: string) => {
    setIngredients((rows) => rows.filter((row) => row.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setLine('');
    }
  };

  const toggleStaple = (id: string) =>
    setIngredients((rows) =>
      rows.map((row) => (row.id === id ? { ...row, staple: !row.staple } : row)),
    );

  const canSave = Boolean(ctx) && name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!ctx || !canSave) return;
    // A line still being typed counts: nobody should lose an ingredient by tapping Save first.
    let finalIngredients = ingredients;
    const pending = ingredientFromLine(editingId ?? newId(), line);
    if (pending) {
      finalIngredients = editingId
        ? ingredients.map((row) =>
            row.id === editingId ? { ...pending, staple: row.staple } : row,
          )
        : [...ingredients, pending];
    }
    const next = {
      name: name.trim(),
      servings,
      notes: notes.trim() || null,
      ingredients: finalIngredients,
    };
    try {
      setSaving(true);
      let id: string;
      if (recipe) {
        id = recipe.id;
        // Send only what changed, so a partner's concurrent edit to another field survives.
        const changes: Record<string, unknown> = {};
        if (next.name !== recipe.name) changes.name = next.name;
        if (next.servings !== recipe.servings) changes.servings = next.servings;
        if (next.notes !== recipe.notes) changes.notes = next.notes;
        if (JSON.stringify(next.ingredients) !== JSON.stringify(recipe.ingredients))
          changes.ingredients = next.ingredients;
        if (Object.keys(changes).length > 0) await updateRecord('recipes', recipe.id, changes);
      } else {
        id = await insertRecord('recipes', ctx, next);
      }
      onSaved?.(id);
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

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? t('recipes.form.editTitle') : t('recipes.form.newTitle')}
      footer={<Button label={t('common.save')} onPress={handleSave} disabled={!canSave} />}
    >
      <View className="gap-5">
        <View>
          <SectionLabel>{t('recipes.form.name')}</SectionLabel>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={t('recipes.form.namePlaceholder')}
            maxLength={120}
            autoCapitalize="sentences"
            returnKeyType="next"
          />
        </View>

        <View className="flex-row items-center justify-between">
          <Text className="text-xs leading-4 font-semibold text-ink-muted tracking-wider uppercase">
            {t('recipes.form.servings')}
          </Text>
          <Stepper
            value={servings}
            onChange={setServings}
            decreaseLabel={t('recipes.form.lessServings')}
            increaseLabel={t('recipes.form.moreServings')}
          />
        </View>

        <View>
          <SectionLabel>{t('recipes.form.ingredients')}</SectionLabel>
          <TextField
            ref={lineRef}
            value={line}
            onChangeText={(text) => {
              setLine(text);
              if (text === '') setEditingId(null);
            }}
            placeholder={
              editingId ? t('recipes.form.updateIngredient') : t('recipes.form.addPlaceholder')
            }
            maxLength={200}
            onSubmitEditing={submitLine}
            submitBehavior="submit"
            returnKeyType="done"
            autoCorrect={false}
            autoCapitalize="sentences"
          />
          <Text className="text-sm leading-5 text-ink-muted mt-2">{t('recipes.form.addHint')}</Text>
          {ingredients.length > 0 ? (
            <Card className="mt-3 mb-0">
              {ingredients.map((row, index) => (
                <IngredientRow
                  key={row.id}
                  ingredient={row}
                  first={index === 0}
                  decimal={decimal}
                  editing={row.id === editingId}
                  onEdit={() => startEditing(row)}
                  onToggleStaple={() => toggleStaple(row.id)}
                  onRemove={() => remove(row.id)}
                />
              ))}
            </Card>
          ) : null}
        </View>

        <View>
          <SectionLabel>{t('recipes.notes')}</SectionLabel>
          <TextField
            value={notes}
            onChangeText={setNotes}
            placeholder={t('recipes.form.notesPlaceholder')}
            multiline
            maxLength={5000}
            textAlignVertical="top"
            style={{ minHeight: 96, paddingTop: 12 }}
          />
        </View>
      </View>
    </BottomSheet>
  );
};
