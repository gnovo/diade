/**
 * Creates the list a new-list wizard describes, in one transaction so a failure leaves no half list.
 * What gets written is decided in `newListFlow.ts`.
 */
import type { GroceryRow, ListTemplate, MealPlan, MealPlanRecipe, PlanPeriod, SharedList } from '@diade/domain';
import { newId } from './ids';
import { writeBatch, type WriteContext } from './repository';
import { emptyListWrites, planListWrites, planToReuse } from './newListFlow';

/** A list started empty (the old sheet): the template's category and icon, plus the starters kept. */
export async function createEmptyList(
  ctx: WriteContext,
  name: string,
  template: Pick<ListTemplate, 'category' | 'icon'>,
  starterNames: string[],
): Promise<string> {
  const listId = newId();
  await writeBatch(ctx, emptyListWrites(listId, name, template, starterNames));
  return listId;
}

/**
 * A groceries list started from a meal plan. The list is tied to a plan for the period (an existing one that
 * has no list yet, else a new one), so "Update from plan" and the left-out staples work on it like on any
 * generated list.
 */
export async function createPlanList(
  ctx: WriteContext,
  input: {
    name: string;
    period: PlanPeriod;
    recipes: MealPlanRecipe[];
    rows: GroceryRow[];
    plans: MealPlan[];
    lists: SharedList[];
  },
): Promise<string> {
  const listId = newId();
  const reuse = planToReuse(input.plans, input.lists, input.period);
  await writeBatch(
    ctx,
    planListWrites({
      listId,
      planId: newId(),
      reuse,
      period: input.period,
      recipes: input.recipes,
      name: input.name,
      rows: input.rows,
    }),
  );
  return listId;
}
