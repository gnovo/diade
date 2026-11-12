import {
  builtInNutrition,
  formatNumber,
  type Ingredient,
  type IngredientResolver,
  ingredientMatchKey,
  ingredientNutrition,
  isHighProtein,
  type Recipe,
  type RecipeNutrition,
} from '@diade/domain';
import type { TFunction } from '@diade/i18n';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { setIngredientNutrition } from '../data/ingredientActions';
import { updateRecord } from '../data/repository';
import { BottomSheet } from './BottomSheet';
import { decimalFor } from './RecipeForm';
import { Button, Card, EmptyState, Pill, SectionLabel, TextField, useWriteContext } from './ui';

/** A typed number: a comma works as the decimal point. Empty is null; anything that is not a number is NaN. */
function parseDecimal(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** A value for a text field, with the reader's decimal mark; empty when unset. */
const shown = (value: number | null | undefined, decimal: string): string =>
  value === null || value === undefined ? '' : formatNumber(value, decimal);

const percent = (share: number): number => Math.round(share * 100);

const saveFailed = (t: TFunction) => (err: unknown) =>
  Alert.alert(t('common.couldNotSave'), err instanceof Error ? err.message : t('common.tryAgain'));

/** Per-serving calories and protein a member types for a recipe, with the computed values beside them. */
const RecipeNutritionSheet: React.FC<{
  recipe: Recipe;
  nutrition: RecipeNutrition;
  visible: boolean;
  onClose: () => void;
}> = ({ recipe, nutrition, visible, onClose }) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);
  // Start from what the recipe shows each time the sheet opens.
  if (visible && openFor !== recipe.id) {
    setOpenFor(recipe.id);
    setKcal(shown(nutrition.perServing?.kcal, decimal));
    setProtein(shown(nutrition.perServing?.protein, decimal));
  }
  const close = () => {
    setOpenFor(null);
    onClose();
  };

  const save = () => {
    const k = parseDecimal(kcal);
    const p = parseDecimal(protein);
    if (k === null || p === null || Number.isNaN(k) || Number.isNaN(p) || k > 5000 || p > 500) {
      Alert.alert(t('recipes.nutrition.invalidTitle'), t('recipes.nutrition.invalid'));
      return;
    }
    // The same numbers as computed are not an override: the recipe keeps following its ingredients.
    const same =
      nutrition.computed && nutrition.computed.kcal === k && nutrition.computed.protein === p;
    updateRecord('recipes', recipe.id, { nutrition: same ? null : { kcal: k, protein: p } })
      .then(close)
      .catch(saveFailed(t));
  };

  const followIngredients = () => {
    updateRecord('recipes', recipe.id, { nutrition: null }).then(close).catch(saveFailed(t));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={t('recipes.nutrition.sheetTitle')}
      footer={<Button label={t('common.save')} onPress={save} />}
    >
      <Card>
        <SectionLabel>{t('recipes.nutrition.computed')}</SectionLabel>
        <Text className="text-sm leading-5 text-ink">
          {nutrition.computed
            ? t('recipes.nutrition.computedValue', {
                kcal: nutrition.computed.kcal,
                protein: nutrition.computed.protein,
                percent: percent(nutrition.coverage),
              })
            : t('recipes.nutrition.computedNone')}
        </Text>
      </Card>
      <Text className="text-sm text-ink-muted mb-1">{t('recipes.nutrition.kcalLabel')}</Text>
      <TextField
        value={kcal}
        onChangeText={setKcal}
        keyboardType="decimal-pad"
        accessibilityLabel={t('recipes.nutrition.kcalLabel')}
      />
      <Text className="text-sm text-ink-muted mt-4 mb-1">
        {t('recipes.nutrition.proteinLabel')}
      </Text>
      <TextField
        value={protein}
        onChangeText={setProtein}
        keyboardType="decimal-pad"
        accessibilityLabel={t('recipes.nutrition.proteinLabel')}
      />
      {nutrition.overridden ? (
        <View className="mt-4 items-center">
          <Button
            label={t('recipes.nutrition.useComputed')}
            variant="ghost"
            onPress={followIngredients}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
};

/** The recipe's calories and protein per serving, at the top of its screen. */
export const RecipeNutritionCard: React.FC<{ recipe: Recipe; nutrition: RecipeNutrition }> = ({
  recipe,
  nutrition,
}) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const { perServing } = nutrition;
  return (
    <Card>
      <SectionLabel
        right={
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel={t('recipes.nutrition.editLabel')}
            hitSlop={12}
          >
            <Text className="text-xs leading-4 font-semibold text-ink">{t('common.edit')}</Text>
          </Pressable>
        }
      >
        {t('recipes.nutrition.heading')}
      </SectionLabel>
      {perServing ? (
        <>
          <View className="flex-row items-baseline gap-6">
            <Text className="text-ink">
              <Text className="text-title-1 font-bold">{perServing.kcal}</Text>
              <Text className="text-sm text-ink-muted"> {t('recipes.nutrition.kcal')}</Text>
            </Text>
            <Text className="text-ink">
              <Text className="text-title-1 font-bold">
                {t('recipes.nutrition.grams', { value: perServing.protein })}
              </Text>
              <Text className="text-sm text-ink-muted"> {t('recipes.nutrition.protein')}</Text>
            </Text>
          </View>
          <View className="flex-row items-center justify-between mt-3 gap-2">
            {isHighProtein(perServing) ? <Pill label={t('recipes.highProtein')} /> : <View />}
            <Text className="flex-shrink text-xs text-ink-muted text-right">
              {nutrition.overridden
                ? t('recipes.nutrition.yours')
                : t('recipes.nutrition.coverage', { percent: percent(nutrition.coverage) })}
            </Text>
          </View>
        </>
      ) : (
        <EmptyState message={t('recipes.nutrition.unknown')} />
      )}
      <RecipeNutritionSheet
        recipe={recipe}
        nutrition={nutrition}
        visible={editing}
        onClose={() => setEditing(false)}
      />
    </Card>
  );
};

interface IngredientRow {
  name: string;
  values: ReturnType<typeof ingredientNutrition>;
}

/** The ingredients the recipes use, each once, with what is known about them: unknown ones first, to fill in. */
function nutritionRows(recipes: Recipe[], resolver: IngredientResolver): IngredientRow[] {
  const byKey = new Map<string, string>();
  for (const recipe of recipes) {
    for (const line of recipe.ingredients) {
      const key = resolver.key(line.name);
      if (key && !byKey.has(key)) byKey.set(key, resolver.name(key) ?? line.name);
    }
  }
  return [...byKey.values()]
    .map((name) => ({ name, values: ingredientNutrition(name, resolver) }))
    .sort(
      (a, b) =>
        Number(a.values !== null) - Number(b.values !== null) || a.name.localeCompare(b.name),
    );
}

/** One ingredient's values per 100 g and per unit, for the household. Empty fields follow the built-in table. */
const IngredientNutritionSheet: React.FC<{
  name: string | null;
  entries: Ingredient[];
  resolver: IngredientResolver;
  onClose: () => void;
}> = ({ name, entries, resolver, onClose }) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const ctx = useWriteContext();
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [grams, setGrams] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);
  const table = name ? builtInNutrition(name) : null;
  if (name && openFor !== name) {
    const own = resolver.nutrition(resolver.key(name));
    setOpenFor(name);
    setKcal(shown(own?.kcalPer100g ?? table?.kcalPer100g, decimal));
    setProtein(shown(own?.proteinPer100g ?? table?.proteinPer100g, decimal));
    setGrams(shown(own?.gramsPerUnit ?? table?.gramsPerUnit, decimal));
  }
  const close = () => {
    setOpenFor(null);
    onClose();
  };

  const write = (values: Parameters<typeof setIngredientNutrition>[3]) => {
    if (!ctx || !name) return;
    setIngredientNutrition(ctx, entries, name, values).then(close).catch(saveFailed(t));
  };

  const save = () => {
    const k = parseDecimal(kcal);
    const p = parseDecimal(protein);
    const g = parseDecimal(grams);
    const bad = [k, p, g].some((v) => v !== null && Number.isNaN(v));
    if (bad || (k ?? 0) > 900 || (p ?? 0) > 100 || g === 0 || (g ?? 0) > 5000) {
      Alert.alert(t('ingredients.nutrition.invalidTitle'), t('ingredients.nutrition.invalid'));
      return;
    }
    // A value equal to the table's is not the household's own: it keeps following the table.
    write({
      kcalPer100g: k === table?.kcalPer100g ? null : k,
      proteinPer100g: p === table?.proteinPer100g ? null : p,
      gramsPerUnit: g === table?.gramsPerUnit ? null : g,
    });
  };

  const own = name ? resolver.nutrition(resolver.key(name)) : null;

  return (
    <BottomSheet
      visible={name !== null}
      onClose={close}
      title={name ?? ''}
      footer={<Button label={t('common.save')} onPress={save} />}
    >
      <Text className="text-sm leading-5 text-ink-muted mb-4">
        {table
          ? t('ingredients.nutrition.builtInSource', {
              kcal: formatNumber(table.kcalPer100g, decimal),
              protein: formatNumber(table.proteinPer100g, decimal),
            })
          : t('ingredients.nutrition.noBuiltIn')}
      </Text>
      <Text className="text-sm text-ink-muted mb-1">{t('ingredients.nutrition.kcalLabel')}</Text>
      <TextField
        value={kcal}
        onChangeText={setKcal}
        keyboardType="decimal-pad"
        accessibilityLabel={t('ingredients.nutrition.kcalLabel')}
      />
      <Text className="text-sm text-ink-muted mt-4 mb-1">
        {t('ingredients.nutrition.proteinLabel')}
      </Text>
      <TextField
        value={protein}
        onChangeText={setProtein}
        keyboardType="decimal-pad"
        accessibilityLabel={t('ingredients.nutrition.proteinLabel')}
      />
      <Text className="text-sm text-ink-muted mt-4 mb-1">
        {t('ingredients.nutrition.unitLabel')}
      </Text>
      <TextField
        value={grams}
        onChangeText={setGrams}
        keyboardType="decimal-pad"
        accessibilityLabel={t('ingredients.nutrition.unitLabel')}
      />
      <Text className="text-xs leading-4 text-ink-muted mt-3">
        {t('ingredients.nutrition.appliesToAll')}
      </Text>
      {own ? (
        <View className="mt-4 items-center">
          <Button
            label={t('ingredients.nutrition.reset')}
            variant="ghost"
            onPress={() => write({ kcalPer100g: null, proteinPer100g: null, gramsPerUnit: null })}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
};

/** Calories and protein per 100 g of every ingredient the recipes use: one tap to fill in or correct one. */
export const NutritionSection: React.FC<{
  recipes: Recipe[];
  entries: Ingredient[];
  resolver: IngredientResolver;
}> = ({ recipes, entries, resolver }) => {
  const { t, i18n } = useTranslation();
  const decimal = decimalFor(i18n.language);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const rows = useMemo(() => nutritionRows(recipes, resolver), [recipes, resolver]);
  const needle = ingredientMatchKey(query);
  const matching = rows.filter(({ name }) => !needle || ingredientMatchKey(name).includes(needle));

  return (
    <View className="mt-6">
      <SectionLabel>{t('ingredients.nutrition.heading')}</SectionLabel>
      <Text className="text-sm leading-5 text-ink-muted mb-3">
        {t('ingredients.nutrition.hint')}
      </Text>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('ingredients.merge.search')}
        accessibilityLabel={t('ingredients.merge.search')}
        autoCorrect={false}
      />
      <Card className="mt-3 mb-0">
        {matching.length === 0 ? (
          <EmptyState message={t('ingredients.staplesEmpty')} />
        ) : (
          matching.slice(0, 80).map(({ name, values }, index) => (
            <View key={name}>
              {index === 0 ? null : <View className="h-px bg-border" />}
              <Pressable
                onPress={() => setEditing(name)}
                accessibilityRole="button"
                className="flex-row items-center min-h-[52px] active:opacity-70"
              >
                <Text className="flex-1 text-base text-ink mr-2">{name}</Text>
                <Text className={`text-sm ${values ? 'text-ink-muted' : 'font-semibold text-ink'}`}>
                  {values
                    ? t('ingredients.nutrition.value', {
                        kcal: formatNumber(values.kcalPer100g, decimal),
                        protein: formatNumber(values.proteinPer100g, decimal),
                      })
                    : t('ingredients.nutrition.unknown')}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
      <IngredientNutritionSheet
        name={editing}
        entries={entries}
        resolver={resolver}
        onClose={() => setEditing(null)}
      />
    </View>
  );
};
