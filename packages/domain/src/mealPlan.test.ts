import { describe, expect, it } from 'vitest';
import { createIngredientResolver } from './ingredientCatalog';
import { ingredientMatchKey, singularWord } from './ingredientKeys';
import {
  buildGroceryList,
  defaultPlanPeriod,
  diffPlanAgainstList,
  type GroceryRow,
  groceryAmount,
  isEmptyDiff,
  isWeekPlan,
  mergeGroceryRows,
  missingStaples,
  type PlanListItem,
  periodChoice,
  pickCurrentPlan,
  planForWeek,
  weekPeriod,
} from './mealPlan';
import type { Recipe, RecipeIngredient, RecipeUnit } from './recipes';

let counter = 0;
const ing = (
  name: string,
  quantity: number | null,
  unit: RecipeUnit = 'g',
  staple = false,
): RecipeIngredient => ({
  id: `i${++counter}`,
  name,
  quantity,
  unit,
  staple,
});

const recipe = (id: string, servings: number, ingredients: RecipeIngredient[]): Recipe => ({
  id,
  spaceId: 's',
  creatorId: 'u',
  name: `Recipe ${id}`,
  servings,
  type: null,
  notes: null,
  ingredients,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const find = (rows: GroceryRow[], name: string) => rows.filter((r) => r.name === name);

describe('plural normalisation', () => {
  const cases: Array<[string, string]> = [
    ['egg', 'eggs'],
    ['ovo', 'ovos'],
    ['Tomate', 'tomates'],
    ['Cebola', 'Cebolas'],
    ['lentil', 'lentils'],
    ['Maçã', 'maçãs'],
    ['Açúcar', 'acucar'],
    ['lentilha vermelha', 'lentilhas vermelhas'],
  ];
  it.each(cases)('%s and %s are the same ingredient', (a, b) => {
    expect(ingredientMatchKey(a)).toBe(ingredientMatchKey(b));
  });

  it.each(['hummus', 'couscous', 'gas', 'rice', 'pois', 'asparagus', 'oats'])(
    'leaves %s unchanged apart from the plural rule',
    (word) => {
      // "oats" is the one genuine plural here; everything else must not lose its "s".
      expect(singularWord(word)).toBe(word === 'oats' ? 'oat' : word);
    },
  );

  it('does not merge irregular plurals: two rows beat a wrong merge', () => {
    expect(ingredientMatchKey('tomato')).not.toBe(ingredientMatchKey('tomatoes'));
  });
});

describe('buildGroceryList: scaling', () => {
  it('scales by servings over the recipe servings (4 to 6)', () => {
    const r = recipe('a', 4, [ing('Flour', 200), ing('Milk', 500, 'ml'), ing('Egg', 2, 'unit')]);
    const { rows } = buildGroceryList([{ recipeId: 'a', servings: 6 }], [r]);
    expect(rows.map((x) => [x.name, x.quantity, x.unit])).toEqual([
      ['Flour', 300, 'g'],
      ['Milk', 750, 'ml'],
      ['Egg', 3, 'unit'],
    ]);
  });

  it('scales down and rounds to something sensible', () => {
    const r = recipe('a', 3, [ing('Rice', 100), ing('Stock', 1, 'l')]);
    const { rows } = buildGroceryList([{ recipeId: 'a', servings: 1 }], [r]);
    expect(rows[0].quantity).toBe(33);
    expect(rows[1].quantity).toBe(333);
  });

  it('skips a recipe that no longer exists', () => {
    const { rows } = buildGroceryList([{ recipeId: 'gone', servings: 2 }], []);
    expect(rows).toEqual([]);
  });
});

describe('buildGroceryList: merging', () => {
  it('sums mass across g and kg', () => {
    const a = recipe('a', 2, [ing('Onion', 300)]);
    const b = recipe('b', 2, [ing('Onion', 1.2, 'kg')]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 2 },
        { recipeId: 'b', servings: 2 },
      ],
      [a, b],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: 1500, unit: 'g' });
    expect(groceryAmount(rows[0])).toEqual({ quantity: '1.5', unit: 'kg' });
  });

  it('sums volume across ml and l', () => {
    const a = recipe('a', 1, [ing('Milk', 250, 'ml')]);
    const b = recipe('b', 1, [ing('Milk', 1, 'l')]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(rows[0]).toMatchObject({ quantity: 1250, unit: 'ml' });
    expect(groceryAmount(rows[0])).toEqual({ quantity: '1.25', unit: 'l' });
  });

  it('sums spoons in tsp (1 tbsp = 3 tsp) and reads whole tablespoons back', () => {
    const a = recipe('a', 1, [ing('Sugar', 1, 'tbsp')]);
    const b = recipe('b', 1, [ing('Sugar', 3, 'tsp')]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(rows[0]).toMatchObject({ quantity: 6, unit: 'tsp' });
    expect(groceryAmount(rows[0])).toEqual({ quantity: '2', unit: 'tbsp' });
    expect(groceryAmount({ quantity: 4, unit: 'tsp' })).toEqual({ quantity: '4', unit: 'tsp' });
  });

  it('keeps different unit families as separate rows: 1 onion and 200 g onion', () => {
    const a = recipe('a', 1, [ing('Onion', 1, 'unit')]);
    const b = recipe('b', 1, [ing('Onion', 200)]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(find(rows, 'Onion')).toHaveLength(2);
    expect(rows.map((r) => r.key).sort()).toEqual(['onion|count', 'onion|mass']);
  });

  it('counts pinches on their own', () => {
    const a = recipe('a', 1, [ing('Saffron', 1, 'pinch')]);
    const b = recipe('b', 1, [ing('Saffron', 2, 'pinch')]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(rows[0]).toMatchObject({ quantity: 3, unit: 'pinch', family: 'pinch' });
  });

  it('merges plural and singular names and keeps the first spelling', () => {
    const a = recipe('a', 1, [ing('Ovo', 2, 'unit')]);
    const b = recipe('b', 1, [ing('Ovos', 3, 'unit')]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Ovo', quantity: 5 });
  });

  it('merges names that differ in case and accents', () => {
    const a = recipe('a', 1, [ing('Açúcar', 100)]);
    const b = recipe('b', 1, [ing('acucar', 50)]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(150);
  });

  it('a "to taste" quantity joins a row and adds nothing', () => {
    const a = recipe('a', 1, [ing('Lemon', 2, 'unit')]);
    const b = recipe('b', 1, [ing('Lemon', null, 'unit')]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'b', servings: 1 },
      ],
      [a, b],
    );
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].contributions.map((c) => c.quantity)).toEqual([2, null]);
  });

  it('a row that is only "to taste" has no quantity', () => {
    const a = recipe('a', 1, [ing('Parsley', null, 'unit')]);
    const { rows } = buildGroceryList([{ recipeId: 'a', servings: 1 }], [a]);
    expect(rows[0].quantity).toBeNull();
    expect(groceryAmount(rows[0])).toEqual({ quantity: null, unit: null });
  });

  it('records which recipe asked for what', () => {
    const a = recipe('a', 2, [ing('Flour', 100)]);
    const b = recipe('b', 2, [ing('Flour', 50)]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'a', servings: 4 },
        { recipeId: 'b', servings: 2 },
      ],
      [a, b],
    );
    expect(rows[0].contributions).toEqual([
      { recipeId: 'a', recipeName: 'Recipe a', key: 'flour|mass', quantity: 200, unit: 'g' },
      { recipeId: 'b', recipeName: 'Recipe b', key: 'flour|mass', quantity: 50, unit: 'g' },
    ]);
  });
});

describe('buildGroceryList: staples', () => {
  const a = recipe('a', 1, [
    ing('Pasta', 200),
    ing('Salt', null, 'unit', true),
    ing('Olive oil', 2, 'tbsp', true),
  ]);
  const b = recipe('b', 1, [ing('Olive oil', 1, 'tbsp', true), ing('Butter', 20)]);
  const entries = [
    { recipeId: 'a', servings: 1 },
    { recipeId: 'b', servings: 1 },
  ];

  it('leaves staples out and returns them, merged, for the "left out" group', () => {
    const { rows, staples } = buildGroceryList(entries, [a, b]);
    expect(rows.map((r) => r.name)).toEqual(['Pasta', 'Butter']);
    expect(staples.map((r) => [r.name, r.quantity, r.unit])).toEqual([
      ['Salt', null, 'unit'],
      ['Olive oil', 9, 'tsp'],
    ]);
  });

  it('includeStaples puts them in the rows and leaves nothing out', () => {
    const { rows, staples } = buildGroceryList(entries, [a, b], { includeStaples: true });
    expect(rows.map((r) => r.name)).toEqual(['Pasta', 'Salt', 'Olive oil', 'Butter']);
    expect(staples).toEqual([]);
  });

  it('is a staple only when every recipe flags it: a member who needs it in one recipe gets it', () => {
    const c = recipe('c', 1, [ing('Olive oil', 1, 'l', false)]);
    const { rows, staples } = buildGroceryList(
      [
        { recipeId: 'a', servings: 1 },
        { recipeId: 'c', servings: 1 },
      ],
      [a, c],
    );
    // tbsp and l are different families, so these are two rows: the tbsp one is a staple, the 1 l one is not.
    expect(rows.map((r) => r.key)).toContain('olive oil|volume');
    expect(staples.map((r) => r.key)).toContain('olive oil|spoons');
  });
});

describe('diffPlanAgainstList', () => {
  const pasta = recipe('a', 2, [ing('Pasta', 200), ing('Tomato', 400)]);
  const salad = recipe('b', 2, [ing('Tomato', 100), ing('Lettuce', 1, 'unit')]);
  const both = [
    { recipeId: 'a', servings: 2 },
    { recipeId: 'b', servings: 2 },
  ];

  /** What generating from the plan would store: the rows as list items. */
  const generate = (entries = both, recipes = [pasta, salad]): PlanListItem[] =>
    buildGroceryList(entries, recipes).rows.map((row, i) => ({
      id: `item${i}`,
      name: row.name,
      ...groceryAmount(row),
      isChecked: false,
      editedByHand: false,
      contributions: row.contributions,
    }));

  it('finds nothing to do when the plan has not changed', () => {
    const items = generate();
    const diff = diffPlanAgainstList(buildGroceryList(both, [pasta, salad]), items);
    expect(isEmptyDiff(diff)).toBe(true);
    expect(diff.unchanged).toHaveLength(3);
  });

  it('adds a recipe that joined the plan and increases a shared row', () => {
    const items = generate([both[0]]);
    const diff = diffPlanAgainstList(buildGroceryList(both, [pasta, salad]), items);
    expect(diff.added.map((r) => r.name)).toEqual(['Lettuce']);
    expect(diff.changed.map((c) => [c.item.name, c.from, c.to])).toEqual([
      ['Tomato', '400 g', '500 g'],
    ]);
  });

  it('scales a row when servings go up', () => {
    const items = generate();
    const more = [{ recipeId: 'a', servings: 4 }, both[1]];
    const diff = diffPlanAgainstList(buildGroceryList(more, [pasta, salad]), items);
    expect(diff.changed.map((c) => [c.item.name, c.to])).toEqual([
      ['Pasta', '400 g'],
      ['Tomato', '900 g'],
    ]);
  });

  it("subtracts only a removed recipe's share and removes a row that reaches zero", () => {
    const items = generate();
    const diff = diffPlanAgainstList(buildGroceryList([both[0]], [pasta, salad]), items);
    expect(diff.changed.map((c) => [c.item.name, c.from, c.to])).toEqual([
      ['Tomato', '500 g', '400 g'],
    ]);
    expect(diff.removed.map((i) => i.name)).toEqual(['Lettuce']);
    expect(diff.added).toEqual([]);
  });

  it('never overwrites a row edited by hand: it is kept', () => {
    const items = generate().map((i) =>
      i.name === 'Tomato' ? { ...i, quantity: '1', unit: 'kg', editedByHand: true } : i,
    );
    const diff = diffPlanAgainstList(buildGroceryList([both[0]], [pasta, salad]), items);
    expect(diff.changed).toEqual([]);
    expect(diff.kept.map((k) => [k.item.name, k.row?.quantity])).toEqual([['Tomato', 400]]);
  });

  it('keeps a hand-edited row whose recipe was removed, with no row to compare to', () => {
    const items = generate().map((i) =>
      i.name === 'Lettuce' ? { ...i, quantity: '3', editedByHand: true } : i,
    );
    const diff = diffPlanAgainstList(buildGroceryList([both[0]], [pasta, salad]), items);
    expect(diff.removed).toEqual([]);
    expect(diff.kept).toEqual([{ item: expect.objectContaining({ name: 'Lettuce' }), row: null }]);
  });

  it('applies a quantity change to a checked row and leaves it checked', () => {
    const items = generate().map((i) => (i.name === 'Tomato' ? { ...i, isChecked: true } : i));
    const diff = diffPlanAgainstList(buildGroceryList([both[0]], [pasta, salad]), items);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].item).toMatchObject({ name: 'Tomato', isChecked: true });
  });

  it('refreshes provenance without a visible change when another recipe takes over a row', () => {
    const other = recipe('c', 2, [ing('Tomato', 400)]);
    const items = generate([both[0]]);
    // Recipe a is replaced by c, which asks for the same amount of the same thing.
    const diff = diffPlanAgainstList(
      buildGroceryList([{ recipeId: 'c', servings: 2 }], [pasta, other]),
      items,
    );
    expect(diff.refreshed.map((r) => r.item.name)).toEqual(['Tomato']);
    expect(diff.removed.map((r) => r.name)).toEqual(['Pasta']);
    expect(isEmptyDiff({ ...diff, removed: [] })).toBe(true);
  });

  it('treats a staple the member added by hand as wanted, and does not add the others', () => {
    const withStaples = recipe('s', 1, [
      ing('Rice', 100),
      ing('Salt', 1, 'tsp', true),
      ing('Pepper', 1, 'tsp', true),
    ]);
    const build = buildGroceryList([{ recipeId: 's', servings: 1 }], [withStaples]);
    const salt = build.staples.find((r) => r.name === 'Salt')!;
    const onList: PlanListItem[] = [
      {
        id: 'salt',
        name: 'Salt',
        ...groceryAmount(salt),
        isChecked: false,
        editedByHand: false,
        contributions: salt.contributions,
      },
    ];
    const bigger = buildGroceryList([{ recipeId: 's', servings: 2 }], [withStaples]);
    const diff = diffPlanAgainstList(bigger, onList);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.map((c) => [c.item.name, c.to])).toEqual([['Salt', '2 tsp']]);
    expect(diff.added.map((r) => r.name)).toEqual(['Rice']);
    expect(missingStaples(bigger, onList).map((r) => r.name)).toEqual(['Pepper']);
  });
});

describe('merging confirmed duplicates', () => {
  const a = recipe('a', 2, [ing('Meat', 500), ing('Rice', 200)]);
  const b = recipe('b', 2, [ing('Meet', 250), ing('Rice', 100)]);
  const entries = [
    { recipeId: 'a', servings: 2 },
    { recipeId: 'b', servings: 2 },
  ];
  const build = () => buildGroceryList(entries, [a, b]);
  const merged = () => {
    const [meat, meet] = [find(build().rows, 'Meat')[0], find(build().rows, 'Meet')[0]];
    return mergeGroceryRows(meat, meet);
  };

  it('sums the quantities, keeps the first name and key, and carries every contribution', () => {
    const row = merged();
    expect(row.name).toBe('Meat');
    expect(row.key).toBe('meat|mass');
    expect(row.quantity).toBe(750);
    expect(row.contributions.map((c) => c.key)).toEqual(['meat|mass', 'meet|mass']);
  });

  it('keeps null ("to taste") out of the sum, and stays null when nothing has an amount', () => {
    const t = recipe('t', 1, [ing('Oregano', null), ing('Oregao', null)]);
    const [oregano, oregao] = buildGroceryList([{ recipeId: 't', servings: 1 }], [t]).rows;
    expect(mergeGroceryRows(oregano, oregao).quantity).toBeNull();
    const [meat] = build().rows;
    expect(mergeGroceryRows(oregano, meat).quantity).toBe(500);
  });

  it('does not re-propose the absorbed row, and finds a merged list unchanged', () => {
    const row = merged();
    const items: PlanListItem[] = [
      {
        id: 'm',
        name: row.name,
        ...groceryAmount(row),
        isChecked: false,
        editedByHand: false,
        contributions: row.contributions,
      },
      ...find(build().rows, 'Rice').map((r) => ({
        id: 'r',
        name: r.name,
        ...groceryAmount(r),
        isChecked: false,
        editedByHand: false,
        contributions: r.contributions,
      })),
    ];
    const diff = diffPlanAgainstList(build(), items);
    expect(diff.added).toEqual([]);
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it('scales a merged item as one row when a recipe changes', () => {
    const row = merged();
    const item: PlanListItem = {
      id: 'm',
      name: row.name,
      ...groceryAmount(row),
      isChecked: true,
      editedByHand: false,
      contributions: row.contributions,
    };
    const more = [{ recipeId: 'a', servings: 4 }, entries[1]];
    const diff = diffPlanAgainstList(buildGroceryList(more, [a, b]), [item]);
    expect(diff.changed.map((c) => [c.item.name, c.from, c.to])).toEqual([
      ['Meat', '750 g', '1.25 kg'],
    ]);
    expect(diff.added.map((r) => r.name)).toEqual(['Rice']);
  });

  it('removes a merged item when none of its recipes are planned any more', () => {
    const row = merged();
    const item: PlanListItem = {
      id: 'm',
      name: row.name,
      ...groceryAmount(row),
      isChecked: false,
      editedByHand: false,
      contributions: row.contributions,
    };
    const diff = diffPlanAgainstList(buildGroceryList([], [a, b]), [item]);
    expect(diff.removed).toHaveLength(1);
  });
});

describe('plan periods', () => {
  // 2026-11-04 is a Wednesday.
  const wednesday = new Date(2026, 10, 4);
  it('builds Monday to Sunday weeks', () => {
    expect(weekPeriod(wednesday)).toEqual({ startsOn: '2026-11-02', endsOn: '2026-11-08' });
    expect(weekPeriod(wednesday, 1)).toEqual({ startsOn: '2026-11-09', endsOn: '2026-11-15' });
  });

  it('defaults to the Monday on or after today', () => {
    expect(defaultPlanPeriod(wednesday)).toEqual({ startsOn: '2026-11-09', endsOn: '2026-11-15' });
    expect(defaultPlanPeriod(new Date(2026, 10, 8))).toEqual({
      startsOn: '2026-11-09',
      endsOn: '2026-11-15',
    }); // Sunday
    expect(defaultPlanPeriod(new Date(2026, 10, 9))).toEqual({
      startsOn: '2026-11-09',
      endsOn: '2026-11-15',
    }); // Monday
  });

  it('crosses month and year ends', () => {
    expect(weekPeriod(new Date(2026, 11, 30))).toEqual({
      startsOn: '2026-12-28',
      endsOn: '2027-01-03',
    });
  });

  it('names the quick choices', () => {
    expect(periodChoice(weekPeriod(wednesday), wednesday)).toBe('thisWeek');
    expect(periodChoice(weekPeriod(wednesday, 1), wednesday)).toBe('nextWeek');
    expect(periodChoice({ startsOn: '2026-11-04', endsOn: '2026-11-10' }, wednesday)).toBe(
      'custom',
    );
  });
});

describe('pickCurrentPlan', () => {
  const plan = (startsOn: string, endsOn: string, deletedAt: string | null = null) => ({
    startsOn,
    endsOn,
    deletedAt,
  });
  const today = new Date(2026, 10, 4);

  it('prefers the plan running today, then the next to start, then the latest that ended', () => {
    const past = plan('2026-10-26', '2026-11-01');
    const running = plan('2026-11-02', '2026-11-08');
    const next = plan('2026-11-09', '2026-11-15');
    expect(pickCurrentPlan([past, next, running], today)).toBe(running);
    expect(pickCurrentPlan([past, next], today)).toBe(next);
    expect(pickCurrentPlan([past], today)).toBe(past);
  });

  it('ignores deleted plans and returns null when there are none', () => {
    expect(pickCurrentPlan([plan('2026-11-02', '2026-11-08', 'x')], today)).toBeNull();
    expect(pickCurrentPlan([], today)).toBeNull();
  });
});

describe('week plans', () => {
  const week = (startsOn: string, endsOn: string, deletedAt: string | null = null) => ({
    startsOn,
    endsOn,
    deletedAt,
  });

  it('knows a Monday-to-Sunday plan from a custom one', () => {
    expect(isWeekPlan(week('2026-11-09', '2026-11-15'))).toBe(true);
    expect(isWeekPlan(week('2026-11-10', '2026-11-16'))).toBe(false); // starts on a Tuesday
    expect(isWeekPlan(week('2026-11-09', '2026-11-12'))).toBe(false); // ends early
    expect(isWeekPlan(week('not a date', '2026-11-15'))).toBe(false);
  });

  it('finds the plan for exactly that week, ignoring deleted ones', () => {
    const plans = [
      week('2026-11-02', '2026-11-08'),
      week('2026-11-09', '2026-11-15', '2026-11-01T00:00:00Z'),
      week('2026-11-09', '2026-11-15'),
    ];
    expect(planForWeek(plans, weekPeriod(new Date(2026, 10, 11), 0))).toBe(plans[2]);
    expect(planForWeek(plans, weekPeriod(new Date(2026, 10, 11), -1))).toBe(plans[0]);
    expect(planForWeek(plans, weekPeriod(new Date(2026, 10, 11), 3))).toBeNull();
  });

  it('pages backwards as well as forwards', () => {
    expect(weekPeriod(new Date(2026, 10, 11), -1)).toEqual({
      startsOn: '2026-11-02',
      endsOn: '2026-11-08',
    });
  });
});

describe('ingredients that are one thing under two names', () => {
  const a = recipe('a', 2, [ing('Aubergine', 200), ing('Tomatoes', 400)]);
  const b = recipe('b', 2, [ing('Eggplant', 100), ing('Tomato', 100)]);
  const both = [
    { recipeId: 'a', servings: 2 },
    { recipeId: 'b', servings: 2 },
  ];

  it('groups dictionary synonyms and plurals into one row, keeping the first name', () => {
    const { rows } = buildGroceryList(both, [a, b]);
    expect(rows.map((r) => [r.name, r.quantity])).toEqual([
      ['Aubergine', 300],
      ['Tomatoes', 500],
    ]);
  });

  it('uses a household alias too', () => {
    const resolver = createIngredientResolver([
      { id: 'm', matchKey: 'meat', aliases: [], mergedIntoId: null, deletedAt: null },
      { id: 't', matchKey: 'meet', aliases: [], mergedIntoId: 'm', deletedAt: null },
    ]);
    const x = recipe('x', 1, [ing('Meat', 500)]);
    const y = recipe('y', 1, [ing('Meet', 250)]);
    const { rows } = buildGroceryList(
      [
        { recipeId: 'x', servings: 1 },
        { recipeId: 'y', servings: 1 },
      ],
      [x, y],
      { resolver },
    );
    expect(rows.map((r) => [r.name, r.quantity])).toEqual([['Meat', 750]]);
  });

  it('matches items stored under keys from before the synonym was known', () => {
    // A list made when "Eggplant" and "Aubergine" were two rows (two items, each under its own key).
    const old = (key: string, name: string, quantity: string): PlanListItem => ({
      id: key,
      name,
      quantity,
      unit: 'g',
      isChecked: false,
      editedByHand: false,
      contributions: [
        {
          recipeId: 'a',
          recipeName: 'Recipe a',
          key: `${key}|mass`,
          quantity: Number(quantity),
          unit: 'g',
        },
      ],
    });
    const items = [old('aubergine', 'Aubergine', '200'), old('eggplant', 'Eggplant', '100')];
    const diff = diffPlanAgainstList(buildGroceryList(both, [a, b]), items);
    // The plan now has one aubergine row of 300 g. The first old item is the row; the second is a stray.
    expect(diff.added.map((r) => r.name)).toEqual(['Tomatoes']);
    expect(diff.changed.map((c) => [c.item.name, c.to])).toEqual([['Aubergine', '300 g']]);
    expect(diff.unchanged.map((i) => i.name)).toEqual(['Eggplant']);
  });
});

describe('a row takes the name the household gave an ingredient', () => {
  const x = recipe('x', 1, [ing('Meet', 250)]);
  const y = recipe('y', 1, [ing('Meat', 500)]);
  const entries = [
    {
      id: 'm',
      name: 'Beef mince',
      matchKey: 'meat',
      aliases: [],
      mergedIntoId: null,
      deletedAt: null,
    },
    { id: 't', name: 'Meet', matchKey: 'meet', aliases: [], mergedIntoId: 'm', deletedAt: null },
  ];

  it('shows the catalog name for the merged row, and the written name when there is no entry', () => {
    const plan = [
      { recipeId: 'x', servings: 1 },
      { recipeId: 'y', servings: 1 },
    ];
    const withCatalog = buildGroceryList(plan, [x, y], {
      resolver: createIngredientResolver(entries),
    });
    expect(withCatalog.rows.map((r) => [r.name, r.quantity])).toEqual([['Beef mince', 750]]);
    const without = buildGroceryList(plan, [x, y]);
    expect(without.rows.map((r) => r.name).sort()).toEqual(['Meat', 'Meet']);
  });
});

describe('pantry staples: the household call wins, the recipe line decides otherwise', () => {
  const stew = recipe('s', 1, [
    ing('Salt', 5, 'g', false),
    ing('Paprika', 2, 'g', true),
    ing('Beef', 500),
  ]);
  const plan = [{ recipeId: 's', servings: 1 }];
  const entry = (matchKey: string, staple: boolean | null) => ({
    id: matchKey,
    name: matchKey.charAt(0).toUpperCase() + matchKey.slice(1),
    matchKey,
    aliases: [],
    mergedIntoId: null,
    deletedAt: null,
    staple,
  });

  it('follows the recipe lines when the household has decided nothing', () => {
    const { rows, staples } = buildGroceryList(plan, [stew]);
    expect(rows.map((r) => r.name).sort()).toEqual(['Beef', 'Salt']);
    expect(staples.map((r) => r.name)).toEqual(['Paprika']);
  });

  it('lets the household make an ingredient a staple, or not one, whatever the lines say', () => {
    const resolver = createIngredientResolver([entry('salt', true), entry('paprika', false)]);
    const { rows, staples } = buildGroceryList(plan, [stew], { resolver });
    expect(rows.map((r) => r.name).sort()).toEqual(['Beef', 'Paprika']);
    expect(staples.map((r) => r.name)).toEqual(['Salt']);
  });

  it('a name merged into another shares its setting', () => {
    const resolver = createIngredientResolver([
      entry('sal', true),
      { ...entry('salt', null), mergedIntoId: 'sal' },
    ]);
    // Salt resolves to the kept entry "Sal", which the household marked a staple: its name is used on the row.
    expect(buildGroceryList(plan, [stew], { resolver }).staples.map((r) => r.name)).toContain(
      'Sal',
    );
  });
});

describe('a line with no amount joins the ingredient row in any unit', () => {
  const sauce = recipe('a', 1, [ing('Yoghurt', null, 'unit'), ing('Garlic', null, 'unit')]);
  const bowl = recipe('b', 1, [ing('Yoghurt', 200, 'g'), ing('Garlic', 2, 'unit')]);
  const both = [
    { recipeId: 'a', servings: 1 },
    { recipeId: 'b', servings: 1 },
  ];

  it('is one row with the amount, not a second row for the bare line', () => {
    const { rows } = buildGroceryList(both, [sauce, bowl]);
    expect(rows.map((r) => [r.name, r.quantity, r.contributions.length]).sort()).toEqual([
      ['Garlic', 2, 2],
      ['Yoghurt', 200, 2],
    ]);
  });

  it('keeps a row of its own when no recipe gives the ingredient an amount', () => {
    const { rows } = buildGroceryList([both[0]], [sauce, bowl]);
    expect(rows.map((r) => [r.name, r.quantity]).sort()).toEqual([
      ['Garlic', null],
      ['Yoghurt', null],
    ]);
  });

  it('joins the first row with an amount when the ingredient has several', () => {
    const many = recipe('c', 1, [ing('Garlic', 3, 'g'), ing('Garlic', 100, 'ml')]);
    const { rows } = buildGroceryList([{ recipeId: 'c', servings: 1 }, both[0]], [sauce, many]);
    const garlic = rows.filter((r) => r.name === 'Garlic');
    expect(garlic.map((r) => [r.family, r.quantity, r.contributions.length]).sort()).toEqual([
      ['mass', 3, 2],
      ['volume', 100, 1],
    ]);
  });

  it('is a staple only when every line that feeds it is', () => {
    const salty = recipe('d', 1, [ing('Salt', null, 'unit', true)]);
    const bought = recipe('e', 1, [ing('Salt', 5, 'g', false)]);
    const result = buildGroceryList(
      [
        { recipeId: 'd', servings: 1 },
        { recipeId: 'e', servings: 1 },
      ],
      [salty, bought],
    );
    expect(result.staples).toEqual([]);
    expect(result.rows.map((r) => r.name)).toEqual(['Salt']);
  });

  it('turns a list made before the fix into one row: the bare duplicate is proposed for removal', () => {
    const items = [
      {
        id: 'amount',
        name: 'Yoghurt',
        quantity: '200',
        unit: 'g',
        isChecked: false,
        editedByHand: false,
        contributions: [
          {
            recipeId: 'b',
            recipeName: 'Recipe b',
            key: 'yoghurt|mass',
            quantity: 200,
            unit: 'g' as const,
          },
        ],
      },
      {
        id: 'bare',
        name: 'Yoghurt',
        quantity: null,
        unit: null,
        isChecked: false,
        editedByHand: false,
        contributions: [
          {
            recipeId: 'a',
            recipeName: 'Recipe a',
            key: 'yoghurt|count',
            quantity: null,
            unit: 'unit' as const,
          },
        ],
      },
    ];
    const diff = diffPlanAgainstList(buildGroceryList(both, [sauce, bowl]), items);
    expect(diff.removed.map((i) => i.id)).toEqual(['bare']);
    expect(diff.added.map((r) => r.name)).toEqual(['Garlic']);
    expect(diff.changed).toEqual([]);
  });
});
