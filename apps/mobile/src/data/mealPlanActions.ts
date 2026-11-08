/**
 * Meal plan actions that write to the local store: generating the grocery list, adding a left-out
 * staple, and applying a confirmed "Update from plan". What gets written is decided in `mealPlanWrites.ts`.
 */
import {
  buildGroceryList,
  type GroceryRow,
  type IngredientResolver,
  type MealPlan,
  type PlanDiff,
  type Recipe,
} from '@diade/domain';
import { newId } from './ids';
import { diffWrites, generationWrites, itemInput } from './mealPlanWrites';
import { type WriteContext, writeBatch } from './repository';

/** Builds the grocery list for a plan (staples left out) and returns the new list's id. */
export async function generateGroceryList(
  ctx: WriteContext,
  plan: MealPlan,
  recipes: Recipe[],
  name: string,
  resolver: IngredientResolver,
): Promise<string> {
  const { rows } = buildGroceryList(plan.recipes, recipes, { resolver });
  const listId = newId();
  await writeBatch(ctx, generationWrites(listId, plan.id, name, rows));
  return listId;
}

/** "Add what I need": puts a staple that was left out onto the list, still tied to its recipes. */
export async function addStapleToList(
  ctx: WriteContext,
  listId: string,
  row: GroceryRow,
): Promise<void> {
  await writeBatch(ctx, [
    { op: 'insert', entity: 'list_items', input: itemInput(listId, row, null) },
  ]);
}

export async function applyPlanDiff(
  ctx: WriteContext,
  listId: string,
  diff: PlanDiff,
): Promise<void> {
  await writeBatch(ctx, diffWrites(listId, diff));
}
