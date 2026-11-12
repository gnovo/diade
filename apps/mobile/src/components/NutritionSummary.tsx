import {
  flexUse,
  formatNumber,
  type IngredientResolver,
  type MealPlan,
  type NutritionTargets,
  planForWeek,
  planIntake,
  type Recipe,
  weekPeriod,
} from '@diade/domain';
import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { getActiveMealPlans, getActiveRecipes } from '../data/queries';
import { useIngredientCatalog } from '../data/useIngredientCatalog';
import { useLiveQuery } from '../data/useLiveQuery';
import { decimalFor } from './RecipeForm';
import { Card, EmptyState, SectionLabel } from './ui';

/** One target: what the plan gives against it, as numbers and a bar that stops at the end. */
const TargetRow: React.FC<{ label: string; value: string; share: number; first?: boolean }> = ({
  label,
  value,
  share,
  first,
}) => (
  <View className={first ? '' : 'mt-3'}>
    <View className="flex-row items-baseline justify-between">
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <Text className="text-sm text-ink-muted">{value}</Text>
    </View>
    <View
      className="h-2 rounded-full bg-surface-sunken mt-1.5 overflow-hidden"
      accessibilityRole="progressbar"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(share, 1) * 100) }}
    >
      <View
        className="h-2 rounded-full bg-action"
        style={{ width: `${Math.round(Math.min(Math.max(share, 0), 1) * 100)}%` }}
      />
    </View>
  </View>
);

const useIntake = (
  plan: MealPlan | null,
  recipes: Recipe[],
  resolver: IngredientResolver,
  eaters: number,
) =>
  useMemo(
    () => (plan && plan.recipes.length > 0 ? planIntake(plan, recipes, resolver, eaters) : null),
    [plan, recipes, resolver, eaters],
  );

/** The week's plan for one person, per day, against this member's targets, and the flex budget. */
export const PlanNutritionCard: React.FC<{
  plan: MealPlan;
  recipes: Recipe[];
  resolver: IngredientResolver;
  eaters: number;
  targets: NutritionTargets;
}> = ({ plan, recipes, resolver, eaters, targets }) => {
  const { t } = useTranslation();
  const intake = useIntake(plan, recipes, resolver, eaters);
  if (!intake) return null;
  const flex = flexUse(intake, targets);
  return (
    <Card>
      <SectionLabel>{t('plan.nutrition.heading', { count: Math.max(1, eaters) })}</SectionLabel>
      <TargetRow
        first
        label={t('plan.nutrition.kcal')}
        value={t('plan.nutrition.kcalValue', { value: intake.perDay.kcal, target: targets.kcal })}
        share={intake.perDay.kcal / targets.kcal}
      />
      <TargetRow
        label={t('plan.nutrition.protein')}
        value={t('plan.nutrition.proteinValue', {
          value: intake.perDay.protein,
          target: targets.protein,
        })}
        share={intake.perDay.protein / targets.protein}
      />
      <View className="flex-row items-baseline justify-between mt-4">
        <Text className="text-sm font-semibold text-ink">{t('plan.nutrition.flex')}</Text>
        <Text className={`text-sm ${flex.over ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
          {flex.used === 0
            ? t('plan.nutrition.flexUntouched', { budget: flex.budget })
            : t(flex.over ? 'plan.nutrition.flexOver' : 'plan.nutrition.flexUsed', {
                used: flex.used,
                budget: flex.budget,
              })}
        </Text>
      </View>
      {intake.missing > 0 ? (
        <Text className="text-xs leading-4 text-ink-muted mt-3">
          {t('plan.nutrition.missing', { count: intake.missing })}
        </Text>
      ) : null}
    </Card>
  );
};

/** Today, for a member with targets on: this week's planned day against them, and the water and coffee reminders. */
const TodayNutritionCard: React.FC<{
  plan: MealPlan | null;
  recipes: Recipe[];
  resolver: IngredientResolver;
  eaters: number;
  targets: NutritionTargets;
}> = ({ plan, recipes, resolver, eaters, targets }) => {
  const { t, i18n } = useTranslation();
  const intake = useIntake(plan, recipes, resolver, eaters);
  const water = formatNumber(targets.waterMl / 1000, decimalFor(i18n.language));
  return (
    <Card>
      <SectionLabel>{t('today.nutrition.heading')}</SectionLabel>
      {intake ? (
        <>
          <Text className="text-xs leading-4 text-ink-muted mb-3">
            {t('today.nutrition.planned')}
          </Text>
          <TargetRow
            first
            label={t('plan.nutrition.kcal')}
            value={t('plan.nutrition.kcalValue', {
              value: intake.perDay.kcal,
              target: targets.kcal,
            })}
            share={intake.perDay.kcal / targets.kcal}
          />
          <TargetRow
            label={t('plan.nutrition.protein')}
            value={t('plan.nutrition.proteinValue', {
              value: intake.perDay.protein,
              target: targets.protein,
            })}
            share={intake.perDay.protein / targets.protein}
          />
        </>
      ) : (
        <EmptyState message={t('today.nutrition.noPlan')} />
      )}
      <View className="h-px bg-border my-3" />
      <Text className="text-sm leading-5 text-ink-muted">
        {t('today.nutrition.drinks', { water })}
      </Text>
    </Card>
  );
};

const NO_RECIPES: Recipe[] = [];
const NO_PLANS: MealPlan[] = [];

/** The Today card with its own data, so Today reads recipes and plans only for a member who has targets on. */
export const TodayNutrition: React.FC = () => {
  const nutrition = useNutrition();
  const { members } = useAuth();
  const recipes = useLiveQuery(getActiveRecipes, NO_RECIPES);
  const plans = useLiveQuery(getActiveMealPlans, NO_PLANS);
  const { resolver } = useIngredientCatalog();
  const plan = planForWeek(plans.data, weekPeriod(new Date(), 0)) ?? null;
  if (!nutrition.active || !nutrition.settings.targets) return null;
  return (
    <TodayNutritionCard
      plan={plan}
      recipes={recipes.data}
      resolver={resolver}
      eaters={members.length}
      targets={nutrition.settings.targets}
    />
  );
};
