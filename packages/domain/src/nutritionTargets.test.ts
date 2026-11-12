import { describe, expect, it } from 'vitest';
import { DEFAULT_RESOLVER } from './ingredientCatalog';
import {
  flexUse,
  isValidTargets,
  type NutritionTargets,
  planIntake,
  suggestTargets,
} from './nutritionTargets';
import type { Recipe } from './recipes';

const recipe = (
  id: string,
  name: string,
  servings: number,
  lines: Array<[string, number]>,
): Recipe => ({
  id,
  spaceId: 's',
  creatorId: 'u',
  name,
  servings,
  type: 'meal',
  notes: null,
  ingredients: lines.map(([n, q], i) => ({
    id: `${id}${i}`,
    name: n,
    quantity: q,
    unit: 'g',
    staple: false,
  })),
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
  deletedAt: null,
});

describe('suggestTargets', () => {
  it('gives the brainstorm numbers for a sedentary 38-year-old man, 172 cm, 87 kg', () => {
    expect(
      suggestTargets({ age: 38, heightCm: 172, weightKg: 87, sex: 'male', activity: 'sedentary' }),
    ).toEqual({ kcal: 1600, protein: 140, waterMl: 2500, flexKcalPerWeek: 1000 });
  });

  it('never goes below the floor', () => {
    const small = suggestTargets({
      age: 70,
      heightCm: 150,
      weightKg: 45,
      sex: 'female',
      activity: 'sedentary',
    });
    expect(small.kcal).toBe(1200);
    expect(isValidTargets(small)).toBe(true);
  });
});

describe('isValidTargets', () => {
  const ok: NutritionTargets = { kcal: 1750, protein: 140, waterMl: 2500, flexKcalPerWeek: 1000 };
  it('accepts whole numbers within the limits', () => {
    expect(isValidTargets(ok)).toBe(true);
    expect(isValidTargets({ ...ok, flexKcalPerWeek: 0 })).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isValidTargets({ ...ok, kcal: 900 })).toBe(false);
    expect(isValidTargets({ ...ok, protein: 140.5 })).toBe(false);
    expect(isValidTargets({ ...ok, waterMl: 9000 })).toBe(false);
  });
});

describe('planIntake', () => {
  // 100 g dry rice is 360 kcal and 6.7 g protein; 100 g cooked chicken is 165 kcal and 31 g.
  const rice = recipe('rice', 'Rice', 1, [['Arroz', 100]]);
  const chicken = recipe('chicken', 'Chicken', 2, [['Frango cozido desfiado', 200]]);
  const unknown = recipe('mystery', 'Mystery', 1, [['Molho secreto', 100]]);
  const week = { startsOn: '2026-11-16', endsOn: '2026-11-22' };

  it("splits the household's portions between the people who eat, then over the days", () => {
    const intake = planIntake(
      {
        ...week,
        recipes: [
          { recipeId: 'rice', servings: 14 },
          { recipeId: 'chicken', servings: 14 },
        ],
      },
      [rice, chicken],
      DEFAULT_RESOLVER,
      2,
    );
    // Per person: 7 × (360 + 165) = 3675 kcal and 7 × (7 + 31) = 266 g, over 7 days.
    expect(intake.total).toEqual({ kcal: 3675, protein: 266 });
    expect(intake.perDay).toEqual({ kcal: 525, protein: 38 });
    expect(intake.days).toBe(7);
    expect(intake.missing).toBe(0);
  });

  it('leaves out, and counts, recipes whose numbers are not complete or that are gone', () => {
    const intake = planIntake(
      {
        ...week,
        recipes: [
          { recipeId: 'rice', servings: 7 },
          { recipeId: 'mystery', servings: 7 },
          { recipeId: 'deleted', servings: 2 },
        ],
      },
      [rice, unknown],
      DEFAULT_RESOLVER,
      1,
    );
    expect(intake.perDay).toEqual({ kcal: 360, protein: 7 });
    expect(intake.missing).toBe(2);
  });
});

describe('flexUse', () => {
  const targets: NutritionTargets = {
    kcal: 1750,
    protein: 140,
    waterMl: 2500,
    flexKcalPerWeek: 1000,
  };
  it('uses the budget only for calories over the week target', () => {
    expect(flexUse({ total: { kcal: 12000, protein: 0 }, days: 7 }, targets)).toEqual({
      used: 0,
      budget: 1000,
      over: false,
    });
    expect(flexUse({ total: { kcal: 12890, protein: 0 }, days: 7 }, targets)).toEqual({
      used: 640,
      budget: 1000,
      over: false,
    });
    expect(flexUse({ total: { kcal: 13500, protein: 0 }, days: 7 }, targets)).toEqual({
      used: 1250,
      budget: 1000,
      over: true,
    });
  });
});
