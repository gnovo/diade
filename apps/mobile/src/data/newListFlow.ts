/**
 * The logic behind the new-list wizard, kept pure so it is tested without a screen or a database:
 * which path a choice puts the member on, which plan a period reuses, which review rows become items, and
 * the writes that create the list. `newListActions.ts` hands the writes to `writeBatch`.
 */
import {
  type GroceryRow,
  groceryAmount,
  type ListTemplate,
  type ListTemplateId,
  type MealPlan,
  type MealPlanRecipe,
  type PlanPeriod,
  type SharedList,
} from '@diade/domain';
import { generationWrites } from './mealPlanWrites';
import type { BatchWrite } from './repository';

/** Empty is the old new-list sheet (2 steps); a meal plan adds recipes and a review (4 steps). */
export type StartFrom = 'empty' | 'plan';

/** Only a groceries list can start from a meal plan. */
export const canStartFromPlan = (templateId: ListTemplateId): boolean => templateId === 'groceries';

export function wizardPath(templateId: ListTemplateId, start: StartFrom): StartFrom {
  return canStartFromPlan(templateId) && start === 'plan' ? 'plan' : 'empty';
}

/** "Step n of N": N depends on the path. */
export const stepCount = (path: StartFrom): number => (path === 'plan' ? 4 : 2);

/** The plan whose period is exactly this one: its recipes are what step 3 starts with. */
export function planForPeriod<T extends Pick<MealPlan, 'startsOn' | 'endsOn' | 'deletedAt'>>(
  plans: T[],
  period: PlanPeriod,
): T | null {
  return (
    plans.find(
      (p) => !p.deletedAt && p.startsOn === period.startsOn && p.endsOn === period.endsOn,
    ) ?? null
  );
}

/**
 * A plan generates one list, so a plan that already has a list is not reused: the wizard makes a new plan
 * for the same dates instead. `lists` are the active lists.
 */
export function planToReuse<T extends Pick<MealPlan, 'id' | 'startsOn' | 'endsOn' | 'deletedAt'>>(
  plans: T[],
  lists: Array<Pick<SharedList, 'planId'>>,
  period: PlanPeriod,
): T | null {
  const found = planForPeriod(plans, period);
  return found && !lists.some((list) => list.planId === found.id) ? found : null;
}

/** "400 g", "3", or "" for a row that is only "to taste". */
export function amountText(row: Pick<GroceryRow, 'quantity' | 'unit'>): string {
  const { quantity, unit } = groceryAmount(row);
  return quantity === null ? '' : unit ? `${quantity} ${unit}` : quantity;
}

/**
 * The rows that become items. Every row to buy is on unless the member unticked it (they have it already);
 * a left-out pantry staple is only on if they added it. Rows keep the order of the build.
 */
export function chosenRows(
  rows: GroceryRow[],
  staples: GroceryRow[],
  unticked: ReadonlySet<string>,
  addedStaples: ReadonlySet<string>,
): GroceryRow[] {
  return [
    ...rows.filter((row) => !unticked.has(row.key)),
    ...staples.filter((row) => addedStaples.has(row.key)),
  ];
}

/** The writes for a list started empty: the list, then the template's starter items the member kept. */
export function emptyListWrites(
  listId: string,
  name: string,
  template: Pick<ListTemplate, 'category' | 'icon'>,
  starterNames: string[],
): BatchWrite[] {
  return [
    {
      op: 'insert',
      entity: 'lists',
      id: listId,
      input: { name, category: template.category, icon: template.icon },
    },
    ...starterNames.map(
      (starter): BatchWrite => ({
        op: 'insert',
        entity: 'list_items',
        input: { listId, name: starter, quantity: null, isChecked: false },
      }),
    ),
  ];
}

/**
 * The writes for a list started from a meal plan: the plan (made now, or an existing one for the same dates
 * that gets the chosen recipes), then the list tied to it and one item per chosen row. The plan comes first,
 * so it reaches the server before the list that points at it.
 */
export function planListWrites(input: {
  listId: string;
  planId: string;
  /** An existing plan for this period that has no list yet; null makes a new one. */
  reuse: Pick<MealPlan, 'id'> | null;
  period: PlanPeriod;
  recipes: MealPlanRecipe[];
  name: string;
  rows: GroceryRow[];
}): BatchWrite[] {
  const { listId, reuse, period, recipes, name, rows } = input;
  const planId = reuse ? reuse.id : input.planId;
  const planWrite: BatchWrite = reuse
    ? { op: 'update', entity: 'meal_plans', id: reuse.id, changes: { recipes } }
    : { op: 'insert', entity: 'meal_plans', id: planId, input: { ...period, recipes } };
  return [planWrite, ...generationWrites(listId, planId, name, rows)];
}
