import {
  buildGroceryList,
  diffPlanAgainstList,
  groceryAmount,
  type Recipe,
  type RecipeIngredient,
  type RecipeUnit,
} from '@diade/domain';
import { parseSyncPayload } from '@diade/validation';
import { describe, expect, it } from 'vitest';
import { fromRow, toColumns } from './mapping';
import { diffWrites, generationWrites, itemInput } from './mealPlanWrites';

const RECIPE_A = '66666666-6666-4666-8666-666666666666';
const RECIPE_B = '77777777-7777-4777-8777-777777777777';
const LIST = '88888888-8888-4888-8888-888888888888';
const PLAN = '99999999-9999-4999-8999-999999999999';

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
const both = [
  { recipeId: RECIPE_A, servings: 2 },
  { recipeId: RECIPE_B, servings: 2 },
];

describe('generationWrites', () => {
  const { rows } = buildGroceryList(both, [pasta, salad]);
  const writes = generationWrites(LIST, PLAN, 'Groceries · 9–15 Nov', rows);

  it('creates the groceries list, pointing at its plan, then one item per row', () => {
    expect(writes[0]).toMatchObject({ op: 'insert', entity: 'lists', id: LIST });
    expect(writes[0]).toMatchObject({
      input: { planId: PLAN, category: 'groceries', icon: 'shopping-basket' },
    });
    expect(
      writes.slice(1).map((w) => w.op === 'insert' && (w.input as { name: string }).name),
    ).toEqual(['Pasta', 'Tomatoes', 'Lettuce']);
  });

  it('writes amounts for display, keeps the order, and starts unchecked and unedited', () => {
    const items = writes.slice(1).map((w) => (w as { input: Record<string, unknown> }).input);
    expect(items.map((i) => [i.quantity, i.unit, i.position])).toEqual([
      ['200', 'g', 1],
      ['500', 'g', 2],
      ['1', null, 3],
    ]);
    expect(
      items.every((i) => i.listId === LIST && i.editedByHand === false && i.isChecked === false),
    ).toBe(true);
  });

  it('only writes payloads the server will accept', () => {
    for (const write of writes) {
      if (write.op !== 'insert') throw new Error('expected inserts');
      expect(parseSyncPayload(write.entity, 'INSERT', write.input).success).toBe(true);
    }
  });

  it('leaves the staples out', () => {
    expect(
      writes.some((w) => w.op === 'insert' && (w.input as { name?: string }).name === 'Salt'),
    ).toBe(false);
  });
});

describe('diffWrites', () => {
  const built = buildGroceryList(both, [pasta, salad]);
  const items = built.rows.map((row, i) => ({
    id: `item${i}`,
    name: row.name,
    ...groceryAmount(row),
    isChecked: false,
    editedByHand: false,
    contributions: row.contributions,
  }));

  it('writes nothing for a plan that has not changed', () => {
    expect(diffWrites(LIST, diffPlanAgainstList(built, items))).toEqual([]);
  });

  it('adds, changes, removes and keeps, each with the right write', () => {
    const edited = items.map((i) =>
      i.name === 'Pasta' ? { ...i, quantity: '1', unit: 'kg', editedByHand: true } : i,
    );
    const smaller = buildGroceryList([{ recipeId: RECIPE_A, servings: 1 }], [pasta, salad]);
    const diff = diffPlanAgainstList(smaller, edited);
    const writes = diffWrites(LIST, diff);

    // Tomatoes shrink to recipe A's share at 1 serving (200 g), Lettuce goes, Pasta (hand-edited) is kept.
    expect(writes).toContainEqual(
      expect.objectContaining({
        op: 'update',
        id: 'item1',
        changes: expect.objectContaining({ quantity: '200', unit: 'g' }),
      }),
    );
    expect(writes).toContainEqual({ op: 'delete', entity: 'list_items', id: 'item2' });
    const keptWrite = writes.find((w) => w.op === 'update' && w.id === 'item0');
    expect(keptWrite).toMatchObject({ changes: { contributions: expect.any(Array) } });
    expect((keptWrite as { changes: Record<string, unknown> }).changes).not.toHaveProperty(
      'quantity',
    );
  });

  it('inserts added rows into the existing list without a position', () => {
    const justA = buildGroceryList([both[0]], [pasta, salad]);
    const aItems = justA.rows.map((row, i) => ({
      id: `a${i}`,
      name: row.name,
      ...groceryAmount(row),
      isChecked: false,
      editedByHand: false,
      contributions: row.contributions,
    }));
    const writes = diffWrites(LIST, diffPlanAgainstList(built, aItems));
    const added = writes.find((w) => w.op === 'insert');
    expect(added).toMatchObject({ input: { listId: LIST, name: 'Lettuce', position: null } });
  });

  it('clears the provenance of a hand-edited row no recipe asks for any more', () => {
    const edited = items.map((i) =>
      i.name === 'Lettuce' ? { ...i, quantity: '3', editedByHand: true } : i,
    );
    const diff = diffPlanAgainstList(buildGroceryList([both[0]], [pasta, salad]), edited);
    const write = diffWrites(LIST, diff).find((w) => w.op === 'update' && w.id === 'item2');
    expect(write).toMatchObject({ changes: { contributions: null } });
  });

  it('only writes payloads the server will accept', () => {
    const diff = diffPlanAgainstList(
      buildGroceryList([{ recipeId: RECIPE_A, servings: 4 }], [pasta, salad]),
      items,
    );
    for (const write of diffWrites(LIST, diff)) {
      if (write.op === 'delete') continue;
      const input = write.op === 'insert' ? write.input : write.changes;
      expect(
        parseSyncPayload(write.entity, write.op === 'insert' ? 'INSERT' : 'UPDATE', input).success,
      ).toBe(true);
    }
  });
});

describe('item rows in the local store', () => {
  it('keeps contributions as JSON text, and "not from a plan" as SQL NULL', () => {
    const row = buildGroceryList([both[0]], [pasta]).rows[0];
    const input = { id: 'x', ...itemInput(LIST, row, 1) };
    const { columns, values } = toColumns(input);
    const stored = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
    expect(stored.contributions).toBe(JSON.stringify(row.contributions));
    expect(stored.edited_by_hand).toBe(0);
    expect(fromRow(stored)).toMatchObject({
      contributions: row.contributions,
      editedByHand: false,
    });

    const plain = toColumns({ id: 'y', contributions: null });
    expect(plain.values).toEqual(['y', null]);
    expect(fromRow({ id: 'y', contributions: null })).toEqual({ id: 'y', contributions: null });
  });

  it("stores a plan's recipes as JSON text", () => {
    const recipes = [{ recipeId: RECIPE_A, servings: 4 }];
    const { values } = toColumns({ id: 'p', recipes });
    expect(values).toEqual(['p', JSON.stringify(recipes)]);
    expect(fromRow({ id: 'p', recipes: JSON.stringify(recipes) })).toEqual({ id: 'p', recipes });
  });
});
