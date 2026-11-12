/**
 * A member's daily targets, and the week's plan measured against them.
 *
 * Tracking is planned-only: nobody logs what they ate. A plan is a pool of recipes for a week, so "per day" is the
 * plan's total for one person divided by the days of the plan. The plan's servings are household portions, split
 * evenly between the members who eat (decision 7 of docs/plans/health).
 */

import { daysBetween, parseDateOnly } from './importantDates';
import type { IngredientResolver } from './ingredientCatalog';
import { type Macros, recipeNutrition } from './ingredientNutrition';
import type { MealPlan } from './mealPlan';
import type { Recipe } from './recipes';

/** What a member aims for each day, and the weekly room for flexible meals. All whole numbers. */
export interface NutritionTargets {
  kcal: number;
  protein: number;
  waterMl: number;
  /** Calories a week above the daily target that flexible meals may use. */
  flexKcalPerWeek: number;
}

export const NUTRITION_TARGET_LIMITS = {
  kcal: { min: 1000, max: 5000 },
  protein: { min: 20, max: 400 },
  waterMl: { min: 500, max: 6000 },
  flexKcalPerWeek: { min: 0, max: 5000 },
} as const;

export const DEFAULT_FLEX_KCAL_PER_WEEK = 1000;

export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/** Daily energy use as a multiple of resting energy. */
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export interface BodyFacts {
  age: number;
  heightCm: number;
  weightKg: number;
  sex: 'male' | 'female';
  activity: ActivityLevel;
}

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

/**
 * Targets for losing weight steadily, from the Mifflin-St Jeor resting energy. Estimates, not medical advice:
 * - calories: daily energy use minus 500, rounded to 50, never below 1500 (men) or 1200 (women);
 * - protein: 1.6 g per kg, rounded to 5 (keeps muscle while eating less);
 * - water: 30 ml per kg from drinks, rounded to a quarter litre.
 */
export function suggestTargets(body: BodyFacts): NutritionTargets {
  const resting =
    10 * body.weightKg + 6.25 * body.heightCm - 5 * body.age + (body.sex === 'male' ? 5 : -161);
  const daily = resting * ACTIVITY_FACTOR[body.activity];
  const floor = body.sex === 'male' ? 1500 : 1200;
  return {
    kcal: Math.max(floor, roundTo(daily - 500, 50)),
    protein: roundTo(1.6 * body.weightKg, 5),
    waterMl: roundTo(30 * body.weightKg, 250),
    flexKcalPerWeek: DEFAULT_FLEX_KCAL_PER_WEEK,
  };
}

/** Whether every field is a whole number within its limits. */
export function isValidTargets(targets: NutritionTargets): boolean {
  return (Object.keys(NUTRITION_TARGET_LIMITS) as Array<keyof NutritionTargets>).every((field) => {
    const value = targets[field];
    const { min, max } = NUTRITION_TARGET_LIMITS[field];
    return Number.isInteger(value) && value >= min && value <= max;
  });
}

export interface PlanIntake {
  /** One person's average day over the plan, from the recipes whose numbers are complete. */
  perDay: Macros;
  /** The plan's whole period for one person, same recipes. */
  total: Macros;
  days: number;
  /** Recipes in the plan whose numbers are not complete: left out of the sums, so the summary can say so. */
  missing: number;
}

/** What one person eats on an average day of the plan, as planned. */
export function planIntake(
  plan: Pick<MealPlan, 'startsOn' | 'endsOn' | 'recipes'>,
  recipes: readonly Recipe[],
  resolver: IngredientResolver,
  eaters: number,
): PlanIntake {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const people = Math.max(1, eaters);
  const start = parseDateOnly(plan.startsOn);
  const end = parseDateOnly(plan.endsOn);
  const days = start && end ? Math.max(1, daysBetween(start, end) + 1) : 7;
  let kcal = 0;
  let protein = 0;
  let missing = 0;
  for (const entry of plan.recipes) {
    const recipe = byId.get(entry.recipeId);
    const nutrition = recipe ? recipeNutrition(recipe, resolver) : null;
    if (!nutrition?.complete || !nutrition.perServing) {
      missing++;
      continue;
    }
    kcal += nutrition.perServing.kcal * entry.servings;
    protein += nutrition.perServing.protein * entry.servings;
  }
  const total = { kcal: Math.round(kcal / people), protein: Math.round(protein / people) };
  return {
    perDay: { kcal: Math.round(total.kcal / days), protein: Math.round(total.protein / days) },
    total,
    days,
    missing,
  };
}

export interface FlexUse {
  /** Calories over the period's target that the plan uses from the budget; 0 when it stays within. */
  used: number;
  budget: number;
  /** Whether the plan goes past the budget too. */
  over: boolean;
}

/**
 * The flex budget is calories, not meals: the plan's total for one person above the period's target (daily target ×
 * days) uses it. A week planned under the target leaves it untouched, whatever its flexible meals.
 */
export function flexUse(
  intake: Pick<PlanIntake, 'total' | 'days'>,
  targets: NutritionTargets,
): FlexUse {
  const budget = Math.round((targets.flexKcalPerWeek * intake.days) / 7);
  const used = Math.max(0, intake.total.kcal - targets.kcal * intake.days);
  return { used, budget, over: used > budget };
}
