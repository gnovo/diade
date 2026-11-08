import {
  buildGroceryList,
  clampServings,
  defaultPlanPeriod,
  diffPlanAgainstList,
  isEmptyDiff,
  isWeekPlan,
  type ListItem,
  type MealPlan,
  type MealPlanRecipe,
  parseDateOnly,
  planForWeek,
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
import { useIngredientCatalog } from '../data/useIngredientCatalog';
import { useLiveQuery } from '../data/useLiveQuery';
import { Icon, useColor } from '../design';
import { planItemsOf } from './PlanListSection';
import { Stepper } from './RecipeForm';
import { RecipePicker } from './RecipePicker';
import { Button, Card, EmptyState, SectionLabel, useWriteContext } from './ui';

/** A plan's period as dates, or null for a stored value that is not a real day. */
function planDates(plan: Pick<MealPlan, 'startsOn' | 'endsOn'>): { from: Date; to: Date } | null {
  const from = parseDateOnly(plan.startsOn);
  const to = parseDateOnly(plan.endsOn);
  return from && to ? { from, to } : null;
}

/** Previous / next week around the dates being shown. */
const WeekNavigator: React.FC<{
  label: string;
  sub: string;
  onPrevious: () => void;
  onNext: () => void;
}> = ({ label, sub, onPrevious, onNext }) => {
  const { t } = useTranslation();
  const ink = useColor('ink');
  return (
    <View className="flex-row items-center mb-4">
      <Pressable
        onPress={onPrevious}
        accessibilityRole="button"
        accessibilityLabel={t('plan.previousWeek')}
        className="w-12 h-12 items-center justify-center rounded-full border border-border active:opacity-60"
      >
        <Icon name="chevron-left" size={20} color={ink} />
      </Pressable>
      <View className="flex-1 items-center" accessibilityLiveRegion="polite">
        <Text className="text-base font-bold text-ink">{label}</Text>
        {sub ? <Text className="text-xs text-ink-muted mt-0.5">{sub}</Text> : null}
      </View>
      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel={t('plan.nextWeekLabel')}
        className="w-12 h-12 items-center justify-center rounded-full border border-border active:opacity-60"
      >
        <Icon name="chevron-right" size={20} color={ink} />
      </Pressable>
    </View>
  );
};

/**
 * The Plan section of the Lists tab: one week at a time. A plan is a pool of recipes (not a calendar) and
 * always exists for the week shown: the first recipe added creates it. It is only the content: the header,
 * the switch and the scroll view belong to the screen that shows it, so they stay put while this fades in.
 */
export const PlanView: React.FC<{
  recipes: Recipe[];
  lists: SharedList[];
  items: ListItem[];
  onOpenList: (listId: string) => void;
}> = ({ recipes, lists, items, onOpenList }) => {
  const { t } = useTranslation();
  const ctx = useWriteContext();
  const plans = useLiveQuery(getActiveMealPlans, [] as MealPlan[]);
  const { resolver } = useIngredientCatalog();
  const today = new Date();
  // Weeks from today; a Sunday opens on the week that begins tomorrow, as new plans do.
  const [offset, setOffset] = useState(() =>
    defaultPlanPeriod(today).startsOn === weekPeriod(today, 0).startsOn ? 0 : 1,
  );
  // A plan that is not one whole week (made before the week view) is opened from "Other plans".
  const [otherId, setOtherId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const week = weekPeriod(today, offset);
  const weekPlan = planForWeek(plans.data, week);
  const plan = plans.data.find((p) => p.id === otherId) ?? weekPlan;
  // Plans the arrows cannot reach: custom periods, and a second plan for the same week.
  const others = plans.data.filter(
    (p) => p.id !== plan?.id && (!isWeekPlan(p) || p.id !== planForWeek(plans.data, p)?.id),
  );
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const build = useMemo(
    () => (plan ? buildGroceryList(plan.recipes, recipes, { resolver }) : null),
    [plan, recipes, resolver],
  );
  const generated = plan ? (lists.find((list) => list.planId === plan.id) ?? null) : null;
  const listItems = useMemo(
    () => (generated ? items.filter((item) => item.listId === generated.id) : []),
    [generated, items],
  );
  const outOfDate = useMemo(
    () =>
      build && generated
        ? !isEmptyDiff(diffPlanAgainstList(build, planItemsOf(listItems), resolver))
        : false,
    [build, generated, listItems, resolver],
  );

  const rangeText = (p: Pick<MealPlan, 'startsOn' | 'endsOn'>, compact = false) => {
    const dates = planDates(p);
    if (!dates) return '';
    return compact
      ? formatCompactRange(t, dates.from, dates.to)
      : formatDateRange(t, dates.from, dates.to);
  };

  const fail = (title: string) => (err: unknown) =>
    Alert.alert(title, err instanceof Error ? err.message : t('common.tryAgain'));

  const save = (target: MealPlan, changes: Record<string, unknown>) =>
    updateRecord('meal_plans', target.id, changes).catch(fail(t('plan.couldNotSave')));

  const setRecipes = async (next: MealPlanRecipe[]) => {
    if (plan) {
      await save(plan, { recipes: next });
      return;
    }
    // The first recipe of a week creates its plan.
    if (!ctx) return;
    try {
      await insertRecord('meal_plans', ctx, { ...week, recipes: next });
    } catch (err) {
      fail(t('plan.couldNotSave'))(err);
    }
  };

  const setServings = (target: MealPlan, recipeId: string, servings: number) =>
    save(target, {
      recipes: target.recipes.map((entry) =>
        entry.recipeId === recipeId ? { ...entry, servings: clampServings(servings) } : entry,
      ),
    });

  const go = (by: number) => {
    setOtherId(null);
    setOffset((current) => current + by);
  };

  const confirmClear = (target: MealPlan) =>
    Alert.alert(t('plan.clearTitle'), t('plan.clearBody', { range: rangeText(target) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('plan.clearWeek'),
        style: 'destructive',
        onPress: async () => {
          setOtherId(null);
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
        resolver,
      );
      onOpenList(listId);
    } catch (err) {
      fail(t('plan.couldNotGenerate'))(err);
    } finally {
      setBusy(false);
    }
  };

  const shown = plan ?? week;
  const dates = planDates(shown);
  const label = dates ? formatCompactRange(t, dates.from, dates.to) : '';
  const sub =
    !plan || plan.id === weekPlan?.id
      ? offset === 0
        ? t('plan.thisWeek')
        : offset === 1
          ? t('plan.nextWeek')
          : offset === -1
            ? t('plan.lastWeek')
            : ''
      : '';
  const toBuy = build?.rows.length ?? 0;
  const staples = build?.staples.length ?? 0;
  const bought = listItems.filter((item) => item.isChecked).length;

  return (
    <>
      <WeekNavigator label={label} sub={sub} onPrevious={() => go(-1)} onNext={() => go(1)} />

      {!plan || plan.recipes.length === 0 ? (
        <Card>
          <EmptyState message={recipes.length === 0 ? t('plan.noLibrary') : t('plan.emptyWeek')} />
          {recipes.length > 0 ? (
            <View className="mt-2">
              <Button label={t('plan.addRecipes')} onPress={() => setPickerOpen(true)} />
            </View>
          ) : null}
        </Card>
      ) : (
        <>
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
                      setRecipes(plan.recipes.filter((r) => r.recipeId !== entry.recipeId))
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
          <View className="mb-4">
            <Button
              label={t('plan.addRecipes')}
              variant="outline"
              onPress={() => setPickerOpen(true)}
            />
          </View>

          <Card>
            {generated ? (
              <>
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-ink">{t('plan.listReady')}</Text>
                  {outOfDate ? (
                    <View className="bg-surface-sunken rounded-full px-3 py-1">
                      <Text className="text-xs font-semibold text-ink">{t('plan.changed')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-sm text-ink-muted mt-0.5 mb-3">
                  {t('plan.shoppingProgress', { done: bought, total: listItems.length })}
                </Text>
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
        </>
      )}

      {plan ? (
        <View className="items-center mt-2">
          <Button
            label={t('plan.clearWeek')}
            variant="ghost"
            small
            onPress={() => confirmClear(plan)}
          />
        </View>
      ) : null}

      {others.length > 0 ? (
        <View className="mt-4">
          <SectionLabel>{t('plan.otherPlans')}</SectionLabel>
          {others.map((other) => (
            <Pressable
              key={other.id}
              onPress={() => setOtherId(other.id)}
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

      <RecipePicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recipes={recipes}
        selected={plan?.recipes ?? []}
        onConfirm={setRecipes}
      />
    </>
  );
};
