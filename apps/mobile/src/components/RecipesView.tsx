import {
  formatAmount,
  formatRecipeMarkdown,
  normalizeIngredientName,
  parseRecipeNotes,
  type Recipe,
  type RecipeIngredient,
} from '@diade/domain';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Linking, Pressable, Share, Text, View } from 'react-native';
import { deleteRecord } from '../data/repository';
import { Icon, useColor } from '../design';
import { BottomSheet } from './BottomSheet';
import { CookingView } from './CookingView';
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

/** A source that is a single web address opens in the browser; anything else is just text. */
const isLink = (source: string): boolean => /^https?:\/\/\S+$/i.test(source);

/** One action in the recipe menu. */
const MenuRow: React.FC<{
  icon: 'pencil' | 'share-2' | 'trash-2';
  label: string;
  onPress: () => void;
  danger?: boolean;
}> = ({ icon, label, onPress, danger }) => {
  const color = useColor(danger ? 'danger' : 'ink');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center min-h-[52px] px-2 rounded-md active:bg-surface-sunken"
    >
      <Icon name={icon} size={20} color={color} />
      <Text className={`ml-3 text-base ${danger ? 'text-danger' : 'text-ink'}`}>{label}</Text>
    </Pressable>
  );
};

/** One recipe on its own screen: ingredients (pantry staples set apart), notes, and an actions menu (edit, share, delete). */
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
  const [cooking, setCooking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const runFromMenu = (action: () => void) => {
    setMenuOpen(false);
    action();
  };
  const sections = useMemo(() => parseRecipeNotes(recipe.notes), [recipe.notes]);
  // Identical steps get distinct keys: the text plus how many came before it.
  const stepRows = useMemo(() => {
    const seen = new Map<string, number>();
    return sections.steps.map((step) => {
      const count = seen.get(step) ?? 0;
      seen.set(step, count + 1);
      return { step, key: `${step}#${count}` };
    });
  }, [sections.steps]);

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
      title={recipe.name}
      onBack={onBack}
      backLabel={t('common.back')}
      right={
        <Pressable
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('recipes.moreActions')}
          className="w-12 h-12 -mr-3 rounded-full items-center justify-center active:bg-surface-sunken"
        >
          <Icon name="ellipsis-vertical" />
        </Pressable>
      }
    >
      <Card>
        <SectionLabel
          right={
            <Text className="text-xs leading-4 text-ink-muted">
              {t('recipes.servings', { count: recipe.servings })}
            </Text>
          }
        >
          {t('recipes.ingredientsHeading')}
        </SectionLabel>
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

      {sections.steps.length > 0 ? (
        <Card>
          <SectionLabel>{t('recipes.steps')}</SectionLabel>
          {stepRows.map(({ step, key }, index) => (
            <View key={key} className="flex-row items-start py-2">
              <Text className="w-7 text-sm font-semibold text-ink-muted">{index + 1}.</Text>
              <Text className="flex-1 text-sm leading-5 text-ink">{step}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {sections.notes ? (
        <Card>
          <SectionLabel>{t('recipes.notes')}</SectionLabel>
          <Text className="text-sm leading-5 text-ink">{sections.notes}</Text>
        </Card>
      ) : null}

      {sections.source ? (
        <Card>
          <SectionLabel>{t('recipes.source')}</SectionLabel>
          {isLink(sections.source) ? (
            <Pressable
              onPress={() => Linking.openURL(sections.source).catch(() => undefined)}
              accessibilityRole="link"
              className="min-h-[48px] justify-center active:opacity-70"
            >
              <Text className="text-sm leading-5 text-ink underline">{sections.source}</Text>
            </Pressable>
          ) : (
            <Text className="text-sm leading-5 text-ink">{sections.source}</Text>
          )}
        </Card>
      ) : null}

      {sections.steps.length > 0 ? (
        <>
          <Button label={t('recipes.cook.start')} onPress={() => setCooking(true)} />
          <View className="h-3" />
        </>
      ) : null}
      <BottomSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t('recipes.moreActions')}
      >
        <View className="pb-2">
          <MenuRow icon="pencil" label={t('common.edit')} onPress={() => runFromMenu(onEdit)} />
          <MenuRow icon="share-2" label={t('recipes.share')} onPress={() => runFromMenu(share)} />
          <MenuRow
            icon="trash-2"
            label={t('recipes.deleteRecipe')}
            danger
            onPress={() => runFromMenu(confirmDelete)}
          />
        </View>
      </BottomSheet>
      <CookingView recipe={recipe} visible={cooking} onClose={() => setCooking(false)} />
    </ScreenScaffold>
  );
};

/**
 * The recipe library: search and a card per recipe. It is only the content: the header, the
 * Lists / Recipes switch and the scroll view belong to the screen that shows it, so they stay put
 * while this fades in.
 */
export const RecipesLibrary: React.FC<{
  recipes: Recipe[];
  onOpen: (recipe: Recipe) => void;
  onOpenIngredients: () => void;
}> = ({ recipes, onOpen, onOpenIngredients }) => {
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
      <Pressable
        onPress={onOpenIngredients}
        accessibilityRole="button"
        className="flex-row items-center bg-surface rounded-2xl p-4 border border-border mb-3 active:opacity-70"
      >
        <View className="flex-1 mr-2">
          <Text className="text-sm font-semibold text-ink">{t('ingredients.entry')}</Text>
          <Text className="text-xs text-ink-muted mt-0.5">{t('ingredients.entryHint')}</Text>
        </View>
        <Icon name="chevron-right" size={18} />
      </Pressable>
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
