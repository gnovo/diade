import { describe, expect, it } from 'vitest';
import { createIngredientResolver, type Ingredient } from './ingredientCatalog';
import { planSetNutrition } from './ingredientMerges';
import {
  builtInNutritionKeys,
  ingredientNutrition,
  isHighProtein,
  lineGrams,
  recipeNutrition,
} from './ingredientNutrition';
import type { RecipeIngredient, RecipeUnit } from './recipes';

const line = (
  id: string,
  name: string,
  quantity: number | null,
  unit: RecipeUnit = 'g',
  staple = false,
): RecipeIngredient => ({ id, name, quantity, unit, staple });

const entry = (over: Partial<Ingredient> & Pick<Ingredient, 'name' | 'matchKey'>): Ingredient => ({
  id: over.matchKey,
  spaceId: 's',
  creatorId: 'u',
  aliases: [],
  mergedIntoId: null,
  staple: null,
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
  deletedAt: null,
  ...over,
});

describe('the built-in table', () => {
  it('gives each name to one food only', () => {
    const owner = new Map<string, number>();
    for (const { name, key, entry: index } of builtInNutritionKeys()) {
      const before = owner.get(key);
      expect(before === undefined || before === index, `${name} (${key}) is in two entries`).toBe(
        true,
      );
      owner.set(key, index);
    }
  });

  it('keeps every value in range', () => {
    for (const { name } of builtInNutritionKeys()) {
      const values = ingredientNutrition(name);
      expect(values, name).not.toBeNull();
      if (!values) continue;
      expect(values.kcalPer100g).toBeGreaterThanOrEqual(0);
      expect(values.kcalPer100g).toBeLessThanOrEqual(900);
      expect(values.proteinPer100g).toBeGreaterThanOrEqual(0);
      expect(values.proteinPer100g).toBeLessThanOrEqual(100);
      // Protein has 4 kcal a gram: a food cannot have more protein calories than calories (rounding allowed).
      expect(values.proteinPer100g * 4, name).toBeLessThanOrEqual(values.kcalPer100g * 1.1 + 1);
    }
  });

  it('knows every measured ingredient the household library used on 2026-11-12', () => {
    const library = [
      'Amendoins sem sal',
      'Arroz',
      'Arroz de couve-flor',
      'Aveia',
      'Azeite',
      'Banana pequena',
      'Batata doce',
      'Batatas',
      'Batatas em gomos',
      'Beringela',
      'Carne de porco magra cozida',
      'Carne de vaca picada magra',
      'Cavala',
      'Cebola',
      'Dente de alho',
      'Dentes de alho',
      'Espinafres congelados',
      'Feijão cozido',
      'Folha de louro',
      'Frango cozido desfiado',
      'Frutos vermelhos congelados',
      'Grão-de-bico cozido',
      'Iogurte grego natural',
      'Lata de atum',
      'Leite meio-gordo',
      'Lentilhas cozidas',
      'Massa',
      'Massa integral',
      'Mel',
      'Ovos',
      'Peito de frango',
      'Peixe',
      'Pescada congelada',
      'Pesto',
      'Pimentos congelados',
      'Pão de hambúrguer',
      'Pão integral',
      'Queijo mozzarella',
      'Queijo parmesão ralado',
      'Sardinhas escorridas',
      'Sementes de chia',
      'Tomate cherry',
      'Tomate em cubos',
      'Tortilha grande',
      'Tortilha integral',
      'Água',
    ];
    expect(library.filter((name) => ingredientNutrition(name) === null)).toEqual([]);
  });
});

describe('ingredientNutrition', () => {
  it('finds a name through the dictionary, in either language', () => {
    expect(ingredientNutrition('Ovos')?.kcalPer100g).toBe(143);
    expect(ingredientNutrition('eggs')?.kcalPer100g).toBe(143);
    expect(ingredientNutrition('Azeite')?.density).toBe(0.91);
  });

  it('does not guess a food it does not know', () => {
    expect(ingredientNutrition('Ervas aromáticas')).toBeNull();
    expect(ingredientNutrition('Frango')).toBeNull();
  });

  it("lets the household's value win, one field at a time", () => {
    const resolver = createIngredientResolver([
      entry({
        name: 'Ovos',
        matchKey: 'egg',
        kcalPer100g: null,
        proteinPer100g: 13,
        gramsPerUnit: 60,
      }),
    ]);
    expect(ingredientNutrition('Ovos', resolver)).toMatchObject({
      kcalPer100g: 143,
      proteinPer100g: 13,
      gramsPerUnit: 60,
      source: 'household',
    });
  });

  it('knows an ingredient only the household has values for', () => {
    const resolver = createIngredientResolver([
      entry({
        name: 'Skyr de baunilha',
        matchKey: 'skyr de baunilha',
        kcalPer100g: 80,
        proteinPer100g: 9,
      }),
    ]);
    expect(ingredientNutrition('Skyr de baunilha', resolver)?.source).toBe('household');
    expect(ingredientNutrition('Skyr de baunilha')).toBeNull();
  });
});

describe('lineGrams', () => {
  const plain = { gramsPerUnit: null, density: 1 };
  it('converts metric units, spoons and counted things', () => {
    expect(lineGrams(line('a', 'x', 1.5, 'kg'), plain)).toBe(1500);
    expect(lineGrams(line('a', 'x', 2, 'tbsp'), { gramsPerUnit: null, density: 0.91 })).toBeCloseTo(
      27.3,
    );
    expect(lineGrams(line('a', 'x', 1, 'l'), plain)).toBe(1000);
    expect(lineGrams(line('a', 'x', 2, 'unit'), { gramsPerUnit: 55, density: 1 })).toBe(110);
    expect(lineGrams(line('a', 'x', 2, 'unit'), plain)).toBeNull();
  });

  it('counts "to taste" and a pinch as nothing', () => {
    expect(lineGrams(line('a', 'x', null, 'unit'), plain)).toBe(0);
    expect(lineGrams(line('a', 'x', 1, 'pinch'), plain)).toBe(0);
  });
});

describe('recipeNutrition', () => {
  // Bowl de frango e grão-de-bico, as it is in the library: one serving.
  const bowl = {
    servings: 1,
    ingredients: [
      line('1', 'Frango cozido desfiado', 130),
      line('2', 'Grão-de-bico cozido', 100),
      line('3', 'Arroz', 40),
      line('4', 'Pimentos congelados', 100),
      line('5', 'Arroz de couve-flor', 100),
      line('6', 'Paprika', null, 'unit', true),
      line('7', 'Alho', null, 'unit', true),
    ],
  };

  it('adds up the known lines per serving, leaving "to taste" out of the coverage', () => {
    const result = recipeNutrition(bowl);
    // 214.5 + 120 + 144 + 26 + 25 kcal; 40.3 + 7 + 2.68 + 1 + 1.9 g protein.
    expect(result.computed).toEqual({ kcal: 530, protein: 53 });
    expect(result.measured).toBe(5);
    expect(result.coverage).toBe(1);
    expect(result.complete).toBe(true);
    expect(result.lines['1']).toEqual({ kcal: 215, protein: 40 });
    expect(result.lines['6']).toBeUndefined();
  });

  it('divides by the servings', () => {
    const result = recipeNutrition({ servings: 4, ingredients: [line('1', 'Arroz', 400)] });
    expect(result.computed).toEqual({ kcal: 360, protein: 7 });
  });

  it('reports what it could not count', () => {
    const result = recipeNutrition({
      servings: 2,
      ingredients: [line('1', 'Ovos', 4, 'unit'), line('2', 'Molho secreto', 50)],
    });
    expect(result.known).toBe(1);
    expect(result.coverage).toBe(0.5);
    expect(result.lines['2']).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.computed).toEqual({ kcal: 157, protein: 14 });
  });

  it("shows the recipe's own values when it has them, and keeps the computed ones", () => {
    const result = recipeNutrition({ ...bowl, nutrition: { kcal: 500, protein: 45 } });
    expect(result.perServing).toEqual({ kcal: 500, protein: 45 });
    expect(result.computed).toEqual({ kcal: 530, protein: 53 });
    expect(result.overridden).toBe(true);
    expect(
      recipeNutrition({
        servings: 1,
        ingredients: [line('1', 'Molho secreto', 50)],
        nutrition: { kcal: 300, protein: 20 },
      }).complete,
    ).toBe(true);
  });

  it('has nothing to show for a recipe with no known line', () => {
    const result = recipeNutrition({ servings: 1, ingredients: [line('1', 'Molho secreto', 50)] });
    expect(result.perServing).toBeNull();
    expect(result.coverage).toBe(0);
  });
});

describe('isHighProtein', () => {
  it('needs at least 8 g of protein per 100 kcal', () => {
    expect(isHighProtein({ kcal: 500, protein: 40 })).toBe(true);
    expect(isHighProtein({ kcal: 500, protein: 39 })).toBe(false);
    expect(isHighProtein({ kcal: 0, protein: 0 })).toBe(false);
    expect(isHighProtein(null)).toBe(false);
  });
});

describe('planSetNutrition', () => {
  it('creates a catalog entry only when a value is set', () => {
    const none = { kcalPer100g: null, proteinPer100g: null, gramsPerUnit: null };
    expect(planSetNutrition('s', [], 'Ovos', none)).toEqual([]);
    const [write] = planSetNutrition('s', [], 'Ovos', { ...none, gramsPerUnit: 60 });
    expect(write).toMatchObject({
      op: 'insert',
      input: { name: 'Ovos', matchKey: 'egg', gramsPerUnit: 60 },
    });
  });

  it('updates the entry the name resolves to, and writes nothing when nothing changed', () => {
    const entries = [entry({ name: 'Ovo', matchKey: 'egg', gramsPerUnit: 60 })];
    const values = { kcalPer100g: null, proteinPer100g: null, gramsPerUnit: 60 };
    expect(planSetNutrition('s', entries, 'Ovos', values)).toEqual([]);
    expect(planSetNutrition('s', entries, 'Ovos', { ...values, gramsPerUnit: null })).toEqual([
      { op: 'update', id: 'egg', changes: { ...values, gramsPerUnit: null } },
    ]);
  });
});
