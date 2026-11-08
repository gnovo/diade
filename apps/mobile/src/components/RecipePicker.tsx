import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { clampServings, normalizeIngredientName, type MealPlanRecipe, type Recipe } from '@diade/domain';
import { BottomSheet } from './BottomSheet';
import { Stepper } from './RecipeForm';
import { Button, Checkbox, EmptyState, TextField } from './ui';

/**
 * Choose recipes, each with the servings to cook. A standalone sheet: it knows nothing about plans, so
 * the new-list wizard can reuse it. It edits a draft and hands the whole selection back on confirm.
 */
export const RecipePicker: React.FC<{
  visible: boolean;
  onClose: () => void;
  recipes: Recipe[];
  /** The selection when the sheet opens. */
  selected: MealPlanRecipe[];
  onConfirm: (next: MealPlanRecipe[]) => void;
}> = ({ visible, onClose, recipes, selected, onConfirm }) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Map<string, number>>(new Map());

  // Each opening starts from what is selected now, with an empty search.
  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setDraft(new Map(selected.map((entry) => [entry.recipeId, entry.servings])));
    // Only reset when the sheet opens, not while the selection changes underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const matches = useMemo(() => {
    const needle = normalizeIngredientName(query);
    if (!needle) return recipes;
    // Searching "salmon" also finds the recipes that use it, not only ones named after it.
    return recipes.filter(
      (r) =>
        normalizeIngredientName(r.name).includes(needle) ||
        r.ingredients.some((row) => normalizeIngredientName(row.name).includes(needle)),
    );
  }, [recipes, query]);

  const toggle = (recipe: Recipe) =>
    setDraft((current) => {
      const next = new Map(current);
      if (next.has(recipe.id)) next.delete(recipe.id);
      else next.set(recipe.id, clampServings(recipe.servings));
      return next;
    });

  const setServings = (recipeId: string, servings: number) =>
    setDraft((current) => new Map(current).set(recipeId, clampServings(servings)));

  const confirm = () => {
    // Keep the order the recipes were chosen in, and drop any that were deleted meanwhile.
    const known = new Set(recipes.map((r) => r.id));
    onConfirm([...draft].filter(([id]) => known.has(id)).map(([recipeId, servings]) => ({ recipeId, servings })));
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('plan.picker.title')}
      footer={
        <Button
          label={draft.size > 0 ? t('plan.picker.add', { count: draft.size }) : t('plan.picker.done')}
          onPress={confirm}
        />
      }
    >
      <View className="mb-3">
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('plan.picker.search')}
          accessibilityLabel={t('plan.picker.search')}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {matches.length === 0 ? <EmptyState message={t('plan.picker.noMatches', { query: query.trim() })} /> : null}
      {matches.map((recipe, index) => {
        const servings = draft.get(recipe.id);
        const checked = servings !== undefined;
        return (
          <View key={recipe.id}>
            {index === 0 ? null : <View className="h-px bg-border" />}
            <View className="flex-row items-center min-h-[64px] py-1">
              <Checkbox
                checked={checked}
                onToggle={() => toggle(recipe)}
                label={t(checked ? 'plan.picker.deselect' : 'plan.picker.select', { name: recipe.name })}
              />
              <Pressable onPress={() => toggle(recipe)} accessible={false} className="flex-1 mr-2">
                <Text className="text-sm font-semibold text-ink">{recipe.name}</Text>
                <Text className="text-xs text-ink-muted mt-0.5">
                  {t('recipes.ingredients', { count: recipe.ingredients.length })}
                </Text>
              </Pressable>
              {checked ? (
                <Stepper
                  value={servings}
                  onChange={(next) => setServings(recipe.id, next)}
                  decreaseLabel={t('plan.lessServings', { name: recipe.name })}
                  increaseLabel={t('plan.moreServings', { name: recipe.name })}
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </BottomSheet>
  );
};
