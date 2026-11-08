import {
  buildGroceryList,
  clampServings,
  defaultPlanPeriod,
  type MealPlan,
  type MealPlanRecipe,
  parseDateOnly,
  periodChoice,
  pickCurrentPlan,
  type Recipe,
  type SharedList,
  weekPeriod,
} from '@diade/domain';
import { formatCompactRange, formatDateRange } from '@diade/i18n';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { generateGroceryList } from '../data/mealPlanActions';
import { getActiveMealPlans } from '../data/queries';
import { deleteRecord, insertRecord, updateRecord } from '../data/repository';
import { useLiveQuery } from '../data/useLiveQuery';
import { Icon } from '../design';
import { DateField } from './DateField';
import { FilterChips } from './FilterChips';
import { Stepper } from './RecipeForm';
import { RecipePicker } from './RecipePicker';
import { Button, Card, EmptyState, SectionLabel, useWriteContext } from './ui';

type PeriodChoice = 'thisWeek' | 'nextWeek' | 'custom';

/** A plan's period as dates, or null for a stored value that is not a real day. */
function planDates(plan: Pick<MealPlan, 'startsOn' | 'endsOn'>): { from: Date; to: Date } | null {
  const from = parseDateOnly(plan.startsOn);
  const to = parseDateOnly(plan.endsOn);
  return from && to ? { from, to } : null;
}

/**
 * The Plan section of the Lists tab: a period and a pool of recipes (not a calendar), and the action that
 * turns it into a grocery list. It is only the content: the header, the switch and the scroll view belong to
 * the screen that shows it, so they stay put while this fades in.
 */
export const PlanView: React.FC<{
  recipes: Recipe[];
  lists: SharedList[];
  onOpenList: (listId: string) => void;
}> = ({ recipes, lists, onOpenList }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const plans = useLiveQuery(getActiveMealPlans, [] as MealPlan[]);
  const today = new Date();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const plan = plans.data.find((p) => p.id === selectedId) ?? pickCurrentPlan(plans.data, today);
  const others = plans.data.filter((p) => p.id !== plan?.id);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const build = useMemo(
    () => (plan ? buildGroceryList(plan.recipes, recipes) : null),
    [plan, recipes],
  );

  const rangeText = (p: MealPlan, compact = false) => {
    const dates = planDates(p);
    if (!dates) return '';
    return compact
      ? formatCompactRange(t, dates.from, dates.to)
      : formatDateRange(t, dates.from, dates.to);
  };

  const fail = (title: string) => (err: unknown) =>
    Alert.alert(title, err instanceof Error ? err.message : t('common.tryAgain'));

  const createPlan = async () => {
    if (!ctx) return;
    try {
      const id = await insertRecord('meal_plans', ctx, {
        ...defaultPlanPeriod(today),
        recipes: [],
      });
      setSelectedId(id);
      setCustomOpen(false);
    } catch (err) {
      fail(t('plan.couldNotSave'))(err);
    }
  };

  const save = (target: MealPlan, changes: Record<string, unknown>) =>
    updateRecord('meal_plans', target.id, changes).catch(fail(t('plan.couldNotSave')));

  const choosePeriod = (target: MealPlan, choice: PeriodChoice) => {
    if (choice === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    save(target, { ...weekPeriod(today, choice === 'thisWeek' ? 0 : 1) });
  };

  const setRecipes = (target: MealPlan, next: MealPlanRecipe[]) => save(target, { recipes: next });

  const setServings = (target: MealPlan, recipeId: string, servings: number) =>
    setRecipes(
      target,
      target.recipes.map((entry) =>
        entry.recipeId === recipeId ? { ...entry, servings: clampServings(servings) } : entry,
      ),
    );

  const confirmDelete = (target: MealPlan) =>
    Alert.alert(t('plan.deleteTitle'), t('plan.deleteBody', { range: rangeText(target) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setSelectedId(null);
          await deleteRecord('meal_plans', target.id);
        },
      },
    ]);

  const makeList = async (target: MealPlan) => {
    if (!ctx || busy) return;
    setBusy(true);
    try {
      const listId = await generateGroceryList(
        ctx,
        target,
        recipes,
        t('plan.listName', { range: rangeText(target, true) }),
      );
      onOpenList(listId);
    } catch (err) {
      fail(t('plan.couldNotGenerate'))(err);
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return (
      <Card>
        <EmptyState message={t('plan.empty')} />
        <View className="mt-2">
          <Button label={t('plan.startPlan')} onPress={createPlan} />
        </View>
      </Card>
    );
  }

  const choice: PeriodChoice = customOpen ? 'custom' : periodChoice(plan, today);
  const generated = lists.find((list) => list.planId === plan.id) ?? null;
  const toBuy = build?.rows.length ?? 0;
  const staples = build?.staples.length ?? 0;

  return (
    <>
      <FilterChips
        label={t('plan.periodLabel')}
        value={choice}
        onChange={(next) => choosePeriod(plan, next)}
        options={[
          { value: 'thisWeek', label: t('plan.thisWeek') },
          { value: 'nextWeek', label: t('plan.nextWeek') },
          { value: 'custom', label: t('plan.custom') },
        ]}
      />
      {choice === 'custom' ? (
        <Card>
          <View className="gap-3">
            <View>
              <SectionLabel>{t('plan.from')}</SectionLabel>
              <DateField
                label={t('plan.from')}
                value={plan.startsOn}
                onChange={(startsOn) =>
                  save(plan, startsOn > plan.endsOn ? { startsOn, endsOn: startsOn } : { startsOn })
                }
              />
            </View>
            <View>
              <SectionLabel>{t('plan.to')}</SectionLabel>
              <DateField
                label={t('plan.to')}
                value={plan.endsOn}
                onChange={(endsOn) =>
                  save(plan, endsOn < plan.startsOn ? { startsOn: endsOn, endsOn } : { endsOn })
                }
              />
            </View>
          </View>
        </Card>
      ) : null}
      <Text className="text-sm text-ink-muted mb-3">
        {t('plan.poolHint', { range: rangeText(plan) })}
      </Text>

      <SectionLabel>{t('plan.recipesHeading')}</SectionLabel>
      {plan.recipes.length === 0 ? (
        <Card>
          <EmptyState message={recipes.length === 0 ? t('plan.noLibrary') : t('plan.noRecipes')} />
        </Card>
      ) : null}
      {plan.recipes.map((entry) => {
        const recipe = recipeById.get(entry.recipeId);
        const name = recipe?.name ?? t('plan.recipeGone');
        return (
          <View
            key={entry.recipeId}
            className="bg-surface rounded-2xl p-4 border border-border mb-3"
          >
            <View className="flex-row items-center">
              <View className="flex-1 mr-2">
                <Text className="text-base font-semibold text-ink">{name}</Text>
                <Text className="text-sm text-ink-muted mt-0.5">{t('plan.servingsLabel')}</Text>
              </View>
              <Stepper
                value={entry.servings}
                onChange={(next) => setServings(plan, entry.recipeId, next)}
                decreaseLabel={t('plan.lessServings', { name })}
                increaseLabel={t('plan.moreServings', { name })}
              />
              <Pressable
                onPress={() =>
                  setRecipes(
                    plan,
                    plan.recipes.filter((r) => r.recipeId !== entry.recipeId),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={t('plan.removeRecipe', { name })}
                className="w-12 h-12 items-center justify-center ml-1 active:opacity-60"
              >
                <Icon name="x" size={18} />
              </Pressable>
            </View>
          </View>
        );
      })}
      {recipes.length > 0 ? (
        <View className="mb-4">
          <Button
            label={t('plan.addRecipes')}
            variant="ghost"
            onPress={() => setPickerOpen(true)}
          />
        </View>
      ) : null}

      {plan.recipes.length > 0 ? (
        <Card>
          {generated ? (
            <>
              <Text className="text-base font-semibold text-ink">{t('plan.listReady')}</Text>
              <Text className="text-sm text-ink-muted mt-0.5 mb-3">{generated.name}</Text>
              <Button label={t('plan.openList')} onPress={() => onOpenList(generated.id)} />
            </>
          ) : (
            <>
              <Text className="text-base font-semibold text-ink">
                {t('plan.toBuy', { count: toBuy })}
              </Text>
              {staples > 0 ? (
                <Text className="text-sm text-ink-muted mt-0.5">
                  {t('plan.staplesLeftOut', { count: staples })}
                </Text>
              ) : null}
              <View className="mt-3">
                <Button
                  label={t('plan.makeList')}
                  onPress={() => makeList(plan)}
                  disabled={busy || toBuy === 0}
                />
              </View>
            </>
          )}
        </Card>
      ) : null}

      {others.length > 0 ? (
        <View className="mt-2">
          <SectionLabel>{t('plan.otherPlans')}</SectionLabel>
          {others.map((other) => (
            <Pressable
              key={other.id}
              onPress={() => {
                setSelectedId(other.id);
                setCustomOpen(false);
              }}
              accessibilityRole="button"
              className="bg-surface rounded-2xl p-4 border border-border mb-3 flex-row items-center active:opacity-70"
            >
              <View className="flex-1">
                <Text className="text-sm font-semibold text-ink">{rangeText(other)}</Text>
                <Text className="text-sm text-ink-muted mt-0.5">
                  {t('plan.recipeCount', { count: other.recipes.length })}
                </Text>
              </View>
              <Icon name="chevron-right" size={18} />
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="gap-3 mt-2">
        <Button label={t('plan.newPlan')} variant="ghost" onPress={createPlan} />
        <Button label={t('plan.deletePlan')} variant="danger" onPress={() => confirmDelete(plan)} />
      </View>

      <RecipePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recipes={recipes}
        selected={plan.recipes}
        onConfirm={(next) => setRecipes(plan, next)}
      />
    </>
  );
};
