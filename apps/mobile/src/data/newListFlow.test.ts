import {
  buildGroceryList,
  type GroceryContribution,
  getListTemplate,
  type Recipe,
  type RecipeIngredient,
  type RecipeUnit,
} from '@diade/domain';
import { parseSyncPayload } from '@diade/validation';
import { describe, expect, it } from 'vitest';
import {
  amountText,
  applyMerges,
  canStartFromPlan,
  chosenRows,
  emptyListWrites,
  planForPeriod,
  planListWrites,
  planToReuse,
  stepCount,
  wizardPath,
} from './newListFlow';

const RECIPE_A = '66666666-6666-4666-8666-666666666666';
const RECIPE_B = '77777777-7777-4777-8777-777777777777';
const LIST = '88888888-8888-4888-8888-888888888888';
const PLAN = '99999999-9999-4999-8999-999999999999';
const OLD_PLAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let n = 0;
const ing = (
  name: string,
  quantity: number | null,
  unit: RecipeUnit = 'g',
  staple = false,
): RecipeIngredient => ({
  id: `i${++n}`,
  name,
  quantity,
  unit,
  staple,
});
const recipe = (id: string, servings: number, ingredients: RecipeIngredient[]): Recipe => ({
  id,
  spaceId: 's',
  creatorId: 'u',
  name: `Recipe ${id.slice(0, 1)}`,
  servings,
  type: null,
  notes: null,
  ingredients,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

const pasta = recipe(RECIPE_A, 2, [
  ing('Pasta', 200),
  ing('Tomatoes', 400),
  ing('Salt', null, 'unit', true),
]);
const salad = recipe(RECIPE_B, 2, [ing('Tomatoes', 100), ing('Lettuce', 1, 'unit')]);
const picked = [
  { recipeId: RECIPE_A, servings: 2 },
  { recipeId: RECIPE_B, servings: 2 },
];
const week = { startsOn: '2026-11-09', endsOn: '2026-11-15' };
const plan = (id: string, period = week, deletedAt: string | null = null) => ({
  id,
  ...period,
  deletedAt,
});

describe('the path a choice puts the member on', () => {
  it('only groceries can start from a meal plan', () => {
    expect(canStartFromPlan('groceries')).toBe(true);
    for (const id of ['pharmacy', 'packing', 'household', 'blank'] as const)
      expect(canStartFromPlan(id)).toBe(false);
  });

  it('is two steps empty and four from a plan', () => {
    expect(stepCount(wizardPath('groceries', 'empty'))).toBe(2);
    expect(stepCount(wizardPath('groceries', 'plan'))).toBe(4);
  });

  it('falls back to empty when a plan is chosen for another type, so going back and changing type is safe', () => {
    expect(wizardPath('pharmacy', 'plan')).toBe('empty');
    expect(wizardPath('blank', 'plan')).toBe('empty');
  });
});

describe('planForPeriod and planToReuse', () => {
  it('finds the plan with exactly this period and ignores deleted ones', () => {
    const plans = [
      plan('x', { startsOn: '2026-11-16', endsOn: '2026-11-22' }),
      plan('y', week, '2026-11-01'),
    ];
    expect(planForPeriod(plans, week)).toBeNull();
    expect(planForPeriod([...plans, plan('z')], week)?.id).toBe('z');
  });

  it('reuses a plan that has no list yet', () => {
    expect(planToReuse([plan(OLD_PLAN)], [], week)?.id).toBe(OLD_PLAN);
  });

  it('does not reuse a plan that already generated a list (one plan, one list)', () => {
    expect(planToReuse([plan(OLD_PLAN)], [{ planId: OLD_PLAN }], week)).toBeNull();
    // A list from some other plan, or none, does not block it.
    expect(planToReuse([plan(OLD_PLAN)], [{ planId: null }, { planId: PLAN }], week)?.id).toBe(
      OLD_PLAN,
    );
  });
});

describe('chosenRows (review rows to items)', () => {
  const { rows, staples } = buildGroceryList(picked, [pasta, salad]);
  const keys = (list: Array<{ name: string }>) => list.map((r) => r.name);

  it('adds every row to buy and no staple by default', () => {
    expect(keys(chosenRows(rows, staples, new Set(), new Set()))).toEqual([
      'Pasta',
      'Tomatoes',
      'Lettuce',
    ]);
  });

  it('leaves out a row the member unticked (they have it)', () => {
    const tomatoes = rows.find((r) => r.name === 'Tomatoes')!;
    expect(keys(chosenRows(rows, staples, new Set([tomatoes.key]), new Set()))).toEqual([
      'Pasta',
      'Lettuce',
    ]);
  });

  it('adds a left-out staple only when the member added it, after the rows to buy', () => {
    const salt = staples[0];
    expect(keys(chosenRows(rows, staples, new Set(), new Set([salt.key])))).toEqual([
      'Pasta',
      'Tomatoes',
      'Lettuce',
      'Salt',
    ]);
  });

  it('ignores keys of rows that are no longer in the build (the recipes changed under it)', () => {
    expect(
      keys(chosenRows(rows, staples, new Set(['gone|mass']), new Set(['also gone|count']))),
    ).toEqual(['Pasta', 'Tomatoes', 'Lettuce']);
  });

  it('writes nothing for rows left out, so the list has only what is wanted', () => {
    const none = chosenRows(rows, staples, new Set(rows.map((r) => r.key)), new Set());
    expect(none).toEqual([]);
  });
});

describe('applyMerges (confirmed duplicates)', () => {
  const meat = recipe(RECIPE_A, 2, [ing('Meat', 500), ing('Rice', 200)]);
  const meet = recipe(RECIPE_B, 2, [ing('Meet', 250)]);
  const { rows } = buildGroceryList(picked, [meat, meet]);
  const [meatRow, riceRow, meetRow] = rows;

  it('changes nothing without merges', () => {
    expect(applyMerges(rows, new Map())).toBe(rows);
  });

  it('folds the absorbed row into the kept one and drops it, keeping the build order', () => {
    const merged = applyMerges(rows, new Map([[meetRow.key, meatRow.key]]));
    expect(merged.map((r) => [r.name, r.quantity])).toEqual([
      ['Meat', 750],
      ['Rice', 200],
    ]);
    expect(merged[0].contributions.map((c) => c.key)).toEqual([meatRow.key, meetRow.key]);
    expect(merged[1]).toBe(riceRow);
  });

  it('stores both keys on the item, so "Update from plan" sees both rows as present', () => {
    const merged = applyMerges(rows, new Map([[meetRow.key, meatRow.key]]));
    const writes = planListWrites({
      listId: LIST,
      planId: PLAN,
      reuse: null,
      name: 'Compras',
      period: week,
      recipes: picked,
      rows: merged,
    });
    const item = writes.find((w) => w.op === 'insert' && w.entity === 'list_items');
    const stored =
      item?.op === 'insert' ? (item.input as { contributions: GroceryContribution[] }) : null;
    expect(stored?.contributions.map((c) => c.key)).toEqual([meatRow.key, meetRow.key]);
  });
});

describe('amountText', () => {
  it('reads like the list does', () => {
    expect(amountText({ quantity: 1500, unit: 'g' })).toBe('1.5 kg');
    expect(amountText({ quantity: 3, unit: 'unit' })).toBe('3');
    expect(amountText({ quantity: null, unit: 'g' })).toBe('');
  });
});

describe('emptyListWrites', () => {
  const groceries = getListTemplate('groceries');
  const writes = emptyListWrites(LIST, 'Groceries', groceries, ['Milk', 'Bread']);

  it('creates the list, then an unchecked item per starter', () => {
    expect(writes[0]).toMatchObject({
      op: 'insert',
      entity: 'lists',
      id: LIST,
      input: { name: 'Groceries' },
    });
    expect(
      writes.slice(1).map((w) => w.op === 'insert' && (w.input as { name: string }).name),
    ).toEqual(['Milk', 'Bread']);
    expect(
      writes
        .slice(1)
        .every((w) => w.op === 'insert' && (w.input as { listId: string }).listId === LIST),
    ).toBe(true);
  });

  it('is just the list when there are no starters', () => {
    expect(emptyListWrites(LIST, 'Blank', getListTemplate('blank'), [])).toHaveLength(1);
  });

  it('only writes payloads the server will accept', () => {
    for (const write of writes) {
      if (write.op !== 'insert') throw new Error('expected inserts');
      expect(parseSyncPayload(write.entity, 'INSERT', write.input).success).toBe(true);
    }
  });
});

describe('planListWrites', () => {
  const { rows } = buildGroceryList(picked, [pasta, salad]);
  const base = {
    listId: LIST,
    planId: PLAN,
    period: week,
    recipes: picked,
    name: 'Groceries · 9–15 Nov',
    rows,
  };

  it('makes a new plan first, then the list pointing at it, then the items', () => {
    const writes = planListWrites({ ...base, reuse: null });
    expect(writes[0]).toMatchObject({
      op: 'insert',
      entity: 'meal_plans',
      id: PLAN,
      input: { ...week, recipes: picked },
    });
    expect(writes[1]).toMatchObject({
      op: 'insert',
      entity: 'lists',
      id: LIST,
      input: { planId: PLAN },
    });
    expect(writes.slice(2).every((w) => w.op === 'insert' && w.entity === 'list_items')).toBe(true);
    expect(writes).toHaveLength(2 + rows.length);
  });

  it('puts the chosen recipes on an existing plan for the same dates and points the list at it', () => {
    const writes = planListWrites({ ...base, reuse: { id: OLD_PLAN } });
    expect(writes[0]).toEqual({
      op: 'update',
      entity: 'meal_plans',
      id: OLD_PLAN,
      changes: { recipes: picked },
    });
    expect(writes[1]).toMatchObject({ entity: 'lists', input: { planId: OLD_PLAN } });
  });

  it('keeps the contributions, so "Update from plan" treats the list as a plan list', () => {
    const writes = planListWrites({ ...base, reuse: null });
    const items = writes
      .slice(2)
      .map((w) => (w as unknown as { input: { contributions: unknown[] | null } }).input);
    expect(items.every((i) => Array.isArray(i.contributions) && i.contributions.length > 0)).toBe(
      true,
    );
  });

  it('only writes payloads the server will accept', () => {
    for (const write of planListWrites({ ...base, reuse: null })) {
      if (write.op !== 'insert') throw new Error('expected inserts');
      expect(parseSyncPayload(write.entity, 'INSERT', write.input).success).toBe(true);
    }
    const [update] = planListWrites({ ...base, reuse: { id: OLD_PLAN } });
    if (update.op !== 'update') throw new Error('expected an update');
    expect(parseSyncPayload(update.entity, 'UPDATE', update.changes).success).toBe(true);
  });
});
