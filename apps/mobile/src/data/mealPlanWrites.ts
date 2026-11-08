/**
 * The writes behind a meal plan: the grocery list a plan generates and the changes "Update from plan"
 * applies. Pure, so they are tested without a database; `mealPlanActions.ts` hands them to `writeBatch`.
 */
import { type GroceryRow, getListTemplate, groceryAmount, type PlanDiff } from '@diade/domain';
import type { BatchWrite } from './repository';

const groceries = getListTemplate('groceries');

/** The item a grocery row becomes. `position` keeps the order the rows were built in. */
export function itemInput(listId: string, row: GroceryRow, position: number | null) {
  const { quantity, unit } = groceryAmount(row);
  return {
    listId,
    name: row.name,
    quantity,
    unit,
    position,
    contributions: row.contributions,
    editedByHand: false,
    isChecked: false,
  };
}

/** The writes that create a groceries list and one item per row. */
export function generationWrites(
  listId: string,
  planId: string,
  name: string,
  rows: GroceryRow[],
): BatchWrite[] {
  return [
    {
      op: 'insert',
      entity: 'lists',
      id: listId,
      input: { name, category: groceries.category, icon: groceries.icon, planId },
    },
    ...rows.map(
      (row, index): BatchWrite => ({
        op: 'insert',
        entity: 'list_items',
        input: itemInput(listId, row, index + 1),
      }),
    ),
  ];
}

/**
 * The writes that apply a confirmed "Update from plan" diff.
 * - added rows are inserted after the existing items (no position: unordered items sort last);
 * - changed rows get the new amount and provenance, and keep their checked state;
 * - removed rows are deleted;
 * - rows kept as the member edited them keep their text, but their provenance is brought up to date,
 *   and a row no recipe asks for any more stops being a plan row (its contributions are cleared);
 * - rows whose text is right get only their provenance refreshed.
 */
export function diffWrites(listId: string, diff: PlanDiff): BatchWrite[] {
  const writes: BatchWrite[] = [];
  for (const row of diff.added)
    writes.push({ op: 'insert', entity: 'list_items', input: itemInput(listId, row, null) });
  for (const { item, row } of diff.changed) {
    const { quantity, unit } = groceryAmount(row);
    writes.push({
      op: 'update',
      entity: 'list_items',
      id: item.id,
      changes: { quantity, unit, contributions: row.contributions },
    });
  }
  for (const item of diff.removed) writes.push({ op: 'delete', entity: 'list_items', id: item.id });
  for (const { item, row } of diff.kept) {
    writes.push({
      op: 'update',
      entity: 'list_items',
      id: item.id,
      changes: { contributions: row ? row.contributions : null },
    });
  }
  for (const { item, row } of diff.refreshed) {
    writes.push({
      op: 'update',
      entity: 'list_items',
      id: item.id,
      changes: { contributions: row.contributions },
    });
  }
  return writes;
}
