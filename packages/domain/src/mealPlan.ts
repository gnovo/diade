/**
 * Meal plans and the grocery list built from them. Everything here is pure: the merge rules are the
 * riskiest logic of the feature, so they take plain data and return plain data and are tested hard.
 *
 * A plan is a pool of recipes (each with the servings wanted) for a period; it is not a calendar.
 * Generating a list is a one-way copy. After that the list is an ordinary list, and "Update from plan"
 * is an explicit action that shows a diff (see `diffPlanAgainstList`).
 */
import { toDateInputValue } from './datetime';
import {
  MAX_SERVINGS,
  MIN_SERVINGS,
  normalizeIngredientName,
  type Recipe,
  type RecipeUnit,
} from './recipes';

export interface MealPlanRecipe {
  recipeId: string;
  /** How many people to cook for; the recipe's quantities are scaled to it. */
  servings: number;
}

export interface MealPlan {
  id: string;
  spaceId: string;
  creatorId: string;
  /** `YYYY-MM-DD`, inclusive. Plain calendar days, like important dates. */
  startsOn: string;
  endsOn: string;
  recipes: MealPlanRecipe[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const MAX_PLAN_RECIPES = 50;

// --- Names ---

/**
 * One word to its singular form, for matching only (the name that is shown is never changed). The rule
 * is deliberately conservative: it drops a single trailing "s" and nothing else, so `egg`/`eggs`
 * and `ovo`/`ovos` meet. Words of three letters or fewer, and words ending in "ss", "us" or "is"
 * (`hummus`, `couscous`, `asparagus`), are left alone. Irregular plurals (`tomato`/`tomatoes`,
 * `peach`/`peaches`, `pão`/`pães`) are not merged: two rows are better than a wrong merge.
 */
export function singularWord(word: string): string {
  if (word.length < 4 || !word.endsWith('s')) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  return word.slice(0, -1);
}

/** Accent-, case- and plural-insensitive form of an ingredient name: what rows are grouped by. */
export function ingredientMatchKey(name: string): string {
  return normalizeIngredientName(name).split(' ').map(singularWord).join(' ');
}

// --- Units ---

export type UnitFamily = 'mass' | 'volume' | 'spoons' | 'count' | 'pinch';

export function unitFamily(unit: RecipeUnit): UnitFamily {
  switch (unit) {
    case 'g':
    case 'kg':
      return 'mass';
    case 'ml':
    case 'l':
      return 'volume';
    case 'tsp':
    case 'tbsp':
      return 'spoons';
    case 'pinch':
      return 'pinch';
    default:
      return 'count';
  }
}

/** The unit each family is summed in. */
export const FAMILY_BASE_UNIT: Record<UnitFamily, RecipeUnit> = {
  mass: 'g',
  volume: 'ml',
  spoons: 'tsp',
  count: 'unit',
  pinch: 'pinch',
};

const TO_BASE: Record<RecipeUnit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  tsp: 1,
  tbsp: 3,
  unit: 1,
  pinch: 1,
};

/** Sensible precision: whole grams and millilitres from 10 up, one decimal below; two for the rest. */
function roundBase(quantity: number, unit: RecipeUnit): number {
  if (unit === 'g' || unit === 'ml')
    return quantity >= 10 ? Math.round(quantity) : Math.round(quantity * 10) / 10;
  return Math.round(quantity * 100) / 100;
}

// --- Building the grocery rows ---

/** What one recipe asked for of one row, in the row's base unit and already scaled to the plan. */
export interface GroceryContribution {
  recipeId: string;
  recipeName: string;
  /** Row identity: `ingredientMatchKey(name)|family`. Lets a stored item be matched back to a row. */
  key: string;
  quantity: number | null;
  unit: RecipeUnit;
}

export interface GroceryRow {
  key: string;
  /** The name as the first recipe wrote it. */
  name: string;
  family: UnitFamily;
  /** In the base unit of the family; null when every contribution is "to taste". */
  quantity: number | null;
  unit: RecipeUnit;
  contributions: GroceryContribution[];
}

export interface GroceryBuild {
  /** What to buy. With `includeStaples` this also holds the staples. */
  rows: GroceryRow[];
  /** Pantry staples left out ("Pantry staples · N left out"); empty when they were included. */
  staples: GroceryRow[];
}

/**
 * Scales every recipe in the plan, groups the ingredients and sums them.
 *
 * - Scale by `servings / recipe.servings`.
 * - Group by name (accent, case and plural insensitive) and unit family. `1 onion` and `200 g onion`
 *   stay two rows; we do not guess.
 * - A null quantity ("to taste") joins any row of the same name and adds nothing.
 * - A row is a staple only when every ingredient that feeds it is flagged as one.
 * - Entries whose recipe no longer exists are skipped.
 */
export function buildGroceryList(
  entries: MealPlanRecipe[],
  recipes: Recipe[],
  options: { includeStaples?: boolean } = {},
): GroceryBuild {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const groups = new Map<string, { row: GroceryRow; allStaples: boolean }>();

  for (const entry of entries) {
    const recipe = byId.get(entry.recipeId);
    if (!recipe || recipe.servings <= 0) continue;
    const factor = entry.servings / recipe.servings;
    for (const ingredient of recipe.ingredients) {
      const family = unitFamily(ingredient.unit);
      const unit = FAMILY_BASE_UNIT[family];
      const key = `${ingredientMatchKey(ingredient.name)}|${family}`;
      const quantity =
        ingredient.quantity === null
          ? null
          : roundBase(ingredient.quantity * TO_BASE[ingredient.unit] * factor, unit);
      const contribution: GroceryContribution = {
        recipeId: recipe.id,
        recipeName: recipe.name,
        key,
        quantity,
        unit,
      };
      const group = groups.get(key);
      if (group) {
        group.row.contributions.push(contribution);
        group.allStaples &&= ingredient.staple;
      } else {
        groups.set(key, {
          row: {
            key,
            name: ingredient.name,
            family,
            quantity: null,
            unit,
            contributions: [contribution],
          },
          allStaples: ingredient.staple,
        });
      }
    }
  }

  const rows: GroceryRow[] = [];
  const staples: GroceryRow[] = [];
  for (const { row, allStaples } of groups.values()) {
    const amounts = row.contributions.flatMap((c) => (c.quantity === null ? [] : [c.quantity]));
    row.quantity =
      amounts.length === 0
        ? null
        : roundBase(
            amounts.reduce((sum, n) => sum + n, 0),
            row.unit,
          );
    (allStaples && !options.includeStaples ? staples : rows).push(row);
  }
  return { rows, staples };
}

// --- Showing a row ---

/**
 * How a row reads on a list: 1500 g is "1.5 kg", 1500 ml is "1.5 l", and 6 tsp is "2 tbsp" (a spoon total
 * is only converted when it comes out even). Always written with a "." so both members compare the same text.
 */
export function groceryAmount(row: Pick<GroceryRow, 'quantity' | 'unit'>): {
  quantity: string | null;
  unit: string | null;
} {
  const { quantity, unit } = row;
  if (quantity === null) return { quantity: null, unit: null };
  const text = (value: number) => String(Math.round(value * 100) / 100);
  if (unit === 'g' && quantity >= 1000) return { quantity: text(quantity / 1000), unit: 'kg' };
  if (unit === 'ml' && quantity >= 1000) return { quantity: text(quantity / 1000), unit: 'l' };
  if (unit === 'tsp' && quantity >= 3 && Number.isInteger(quantity) && quantity % 3 === 0) {
    return { quantity: text(quantity / 3), unit: 'tbsp' };
  }
  if (unit === 'unit') return { quantity: text(quantity), unit: null };
  return { quantity: text(quantity), unit };
}

// --- Update from plan ---

/** A list item that came from a plan (it has contributions), as the diff needs to see it. */
export interface PlanListItem {
  id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  isChecked: boolean;
  /** A member changed the quantity or name: the plan never overwrites it. */
  editedByHand: boolean;
  contributions: GroceryContribution[];
}

export interface PlanChange {
  item: PlanListItem;
  row: GroceryRow;
  /** Display text before and after, e.g. "400 g" and "600 g". */
  from: string;
  to: string;
}

export interface PlanDiff {
  /** Rows the plan now needs that the list does not have. */
  added: GroceryRow[];
  /** Quantity changes applied to rows nobody edited. Checked rows stay checked. */
  changed: PlanChange[];
  /** Rows no recipe asks for any more. */
  removed: PlanListItem[];
  /** Hand-edited rows the plan would have changed: shown as "kept as you edited", never touched. */
  kept: Array<{ item: PlanListItem; row: GroceryRow | null }>;
  /** Rows whose text is right but whose provenance moved (another recipe now feeds them). */
  refreshed: Array<{ item: PlanListItem; row: GroceryRow }>;
  unchanged: PlanListItem[];
}

const amountText = (amount: { quantity: string | null; unit: string | null }) =>
  amount.quantity === null
    ? ''
    : amount.unit
      ? `${amount.quantity} ${amount.unit}`
      : amount.quantity;

const sameContributions = (a: GroceryContribution[], b: GroceryContribution[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Compares what the plan needs now with the plan-derived rows already on the list. Recompute the
 * desired rows with `buildGroceryList` and pass the result in.
 *
 * Staples the member added by hand from the "left out" group count as wanted rows, so they are scaled
 * with the rest instead of being removed. Staples that are not on the list are not added.
 */
export function diffPlanAgainstList(desired: GroceryBuild, items: PlanListItem[]): PlanDiff {
  const wanted = new Map([...desired.rows, ...desired.staples].map((row) => [row.key, row]));
  const diff: PlanDiff = {
    added: [],
    changed: [],
    removed: [],
    kept: [],
    refreshed: [],
    unchanged: [],
  };
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.contributions[0]?.key;
    if (!key) continue;
    // A second item for the same row (it should not happen) is left alone, not double counted.
    if (seen.has(key)) {
      diff.unchanged.push(item);
      continue;
    }
    seen.add(key);

    const row = wanted.get(key);
    if (!row) {
      if (item.editedByHand) diff.kept.push({ item, row: null });
      else diff.removed.push(item);
      continue;
    }
    const target = groceryAmount(row);
    const same = target.quantity === item.quantity && target.unit === item.unit;
    if (same) {
      if (sameContributions(item.contributions, row.contributions)) diff.unchanged.push(item);
      else diff.refreshed.push({ item, row });
    } else if (item.editedByHand) {
      diff.kept.push({ item, row });
    } else {
      diff.changed.push({
        item,
        row,
        from: amountText({ quantity: item.quantity, unit: item.unit }),
        to: amountText(target),
      });
    }
  }

  diff.added = desired.rows.filter((row) => !seen.has(row.key));
  return diff;
}

/** Whether applying the diff would change anything the member can see. */
export function isEmptyDiff(diff: PlanDiff): boolean {
  return diff.added.length + diff.changed.length + diff.removed.length + diff.kept.length === 0;
}

/** Staples the plan leaves out that are not already on the list: the "Pantry staples · N left out" group. */
export function missingStaples(
  build: GroceryBuild,
  items: Array<Pick<PlanListItem, 'contributions'>>,
): GroceryRow[] {
  const present = new Set(items.map((item) => item.contributions[0]?.key).filter(Boolean));
  return build.staples.filter((row) => !present.has(row.key));
}

// --- Plan periods ---

/** The Monday of the week containing `date`, at local midnight. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

export interface PlanPeriod {
  startsOn: string;
  endsOn: string;
}

/** Monday to Sunday, `weeksAhead` weeks after the week of `today`. */
export function weekPeriod(today: Date, weeksAhead = 0): PlanPeriod {
  const monday = addDays(weekStart(today), weeksAhead * 7);
  return { startsOn: toDateInputValue(monday), endsOn: toDateInputValue(addDays(monday, 6)) };
}

/**
 * Where a new plan starts: the Monday on or after today. Shopping on a Sunday is for the week that
 * begins tomorrow, and a plan that started last Monday would be mostly over. "This week" stays one tap away.
 */
export function defaultPlanPeriod(today: Date): PlanPeriod {
  const start = weekStart(today);
  const isMonday =
    start.getTime() === new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return weekPeriod(today, isMonday ? 0 : 1);
}

/** Which of the quick choices a period is, if any. */
export function periodChoice(period: PlanPeriod, today: Date): 'thisWeek' | 'nextWeek' | 'custom' {
  const same = (other: PlanPeriod) =>
    other.startsOn === period.startsOn && other.endsOn === period.endsOn;
  if (same(weekPeriod(today, 0))) return 'thisWeek';
  if (same(weekPeriod(today, 1))) return 'nextWeek';
  return 'custom';
}

/**
 * The plan to show first: the one running today, else the next one to start, else the latest that ended.
 * Deleted plans are ignored.
 */
export function pickCurrentPlan<T extends Pick<MealPlan, 'startsOn' | 'endsOn' | 'deletedAt'>>(
  plans: T[],
  today: Date,
): T | null {
  const day = toDateInputValue(today);
  const live = plans.filter((plan) => !plan.deletedAt);
  const running = live.filter((plan) => plan.startsOn <= day && day <= plan.endsOn);
  if (running.length > 0)
    return [...running].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
  const upcoming = live
    .filter((plan) => plan.startsOn > day)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  if (upcoming.length > 0) return upcoming[0];
  return [...live].sort((a, b) => b.endsOn.localeCompare(a.endsOn))[0] ?? null;
}

/** Keeps servings in range; the stepper and the validation share this. */
export const clampServings = (servings: number): number =>
  Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, Math.round(servings)));
