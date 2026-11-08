import {
  formatAmount,
  formatRecipeMarkdown,
  normalizeIngredientName,
  type Recipe,
  type RecipeIngredient,
} from '@diade/domain';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Pressable, Share, Text, View } from 'react-native';
import { deleteRecord } from '../data/repository';
import { Icon } from '../design';
import { decimalFor } from './RecipeForm';
import { Button, Card, EmptyState, ScreenScaffold, SectionLabel, TextField } from './ui';

const IngredientLine: React.FC<{
  ingredient: RecipeIngredient;
  first: boolean;
  decimal: string;
}> = ({ ingredient, first, decimal }) => {
  const amount = formatAmount(ingredient.quantity, ingredient.unit, decimal);
  return (
    <View>
      {first ? null : <View className="h-px bg-border" />}
      <View className="flex-row items-center min-h-[44px]">
        <Text className="flex-1 text-sm font-medium text-ink mr-2">{ingredient.name}</Text>
        {amount ? <Text className="text-sm text-ink-muted">{amount}</Text> : null}
      </View>
    </View>
  );
};

/** One recipe on its own screen: ingredients (pantry staples set apart), notes, edit and delete. */
export const RecipeDetailScreen: React.FC<{
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
}> = ({ recipe, onBack, onEdit }) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const fresh = recipe.ingredients.filter((row) => !row.staple);
  const pantry = recipe.ingredients.filter((row) => row.staple);

  // The system back button closes the recipe before it leaves the tab, as it does for a list.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // The system share sheet carries the text to any app, and has its own Copy action: no clipboard module needed.
  const share = async () => {
    try {
      await Share.share({ message: formatRecipeMarkdown(recipe) });
    } catch (err) {
      Alert.alert(
        t('recipes.shareFailed'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    }
  };

  const confirmDelete = () =>
    Alert.alert(t('recipes.deleteTitle'), t('recipes.deleteBody', { name: recipe.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          onBack();
          await deleteRecord('recipes', recipe.id);
        },
      },
    ]);

  return (
    <ScreenScaffold
      eyebrow={t('recipes.servings', { count: recipe.servings })}
      title={recipe.name}
      onBack={onBack}
      backLabel={t('common.back')}
      right={<Button label={t('common.edit')} variant="ghost" small onPress={onEdit} />}
    >
      <Card>
        <SectionLabel>{t('recipes.ingredientsHeading')}</SectionLabel>
        {recipe.ingredients.length === 0 ? (
          <EmptyState message={t('recipes.noIngredients')} />
        ) : null}
        {fresh.map((row, index) => (
          <IngredientLine key={row.id} ingredient={row} first={index === 0} decimal={decimal} />
        ))}
        {pantry.length > 0 ? (
          <View className={fresh.length > 0 ? 'mt-4 pt-4 border-t border-border' : ''}>
            <SectionLabel>{t('recipes.pantryHeading')}</SectionLabel>
            <Text className="text-sm leading-5 text-ink-muted mb-1">{t('recipes.pantryHint')}</Text>
            {pantry.map((row, index) => (
              <IngredientLine key={row.id} ingredient={row} first={index === 0} decimal={decimal} />
            ))}
          </View>
        ) : null}
      </Card>

      {recipe.notes ? (
        <Card>
          <SectionLabel>{t('recipes.notes')}</SectionLabel>
          <Text className="text-sm leading-5 text-ink">{recipe.notes}</Text>
        </Card>
      ) : null}

      <Button label={t('recipes.shareMarkdown')} variant="outline" onPress={share} />
      <View className="h-3" />
      <Button label={t('recipes.deleteRecipe')} variant="danger" onPress={confirmDelete} />
    </ScreenScaffold>
  );
};

/**
 * The recipe library: search and a card per recipe. It is only the content: the header, the
 * Lists / Recipes switch and the scroll view belong to the screen that shows it, so they stay put
 * while this fades in.
 */
export const RecipesLibrary: React.FC<{ recipes: Recipe[]; onOpen: (recipe: Recipe) => void }> = ({
  recipes,
  onOpen,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

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

  if (recipes.length === 0) {
    return (
      <Card>
        <EmptyState message={t('recipes.empty')} />
      </Card>
    );
  }

  return (
    <>
      <View className="mb-4">
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t('recipes.searchPlaceholder')}
          accessibilityLabel={t('recipes.searchPlaceholder')}
          returnKeyType="search"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
      {matches.length === 0 ? (
        <Card>
          <EmptyState message={t('recipes.noMatches', { query: query.trim() })} />
        </Card>
      ) : null}
      {matches.map((recipe) => (
        <Pressable
          key={recipe.id}
          onPress={() => onOpen(recipe)}
          accessibilityRole="button"
          className="bg-surface rounded-2xl p-5 border border-border mb-3 active:opacity-70"
        >
          <View className="flex-row items-center">
            <View className="w-10 h-10 rounded-full bg-surface-tint items-center justify-center mr-3">
              <Icon name="utensils" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{recipe.name}</Text>
              <Text className="text-sm text-ink-muted mt-0.5">
                {t('recipes.ingredients', { count: recipe.ingredients.length })}
                {' · '}
                {t('recipes.servings', { count: recipe.servings })}
              </Text>
            </View>
            <Icon name="chevron-right" size={18} />
          </View>
        </Pressable>
      ))}
    </>
  );
};
