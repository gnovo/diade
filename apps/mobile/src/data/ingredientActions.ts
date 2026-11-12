import {
  type CatalogWrite,
  type HouseholdNutrition,
  type Ingredient,
  planMerge,
  planRename,
  planSeparate,
  planSetNutrition,
  planSetStaple,
} from '@diade/domain';
import { type BatchWrite, type WriteContext, writeBatch } from './repository';

/** A catalog plan as the writes the repository applies and queues for sync. */
const toBatch = (writes: CatalogWrite[]): BatchWrite[] =>
  writes.map((write) =>
    write.op === 'insert'
      ? { op: 'insert', entity: 'ingredients', id: write.id, input: write.input }
      : { op: 'update', entity: 'ingredients', id: write.id, changes: write.changes },
  );

/** Why a merge was not made: the two names are empty, or already one ingredient. */
export type MergeError = 'empty' | 'same';

/**
 * Makes `absorbName` one ingredient with `keepName`, for every list from now on. One or two writes (never one
 * per ingredient). Returns an error instead of writing when there is nothing to do.
 */
export async function mergeIngredientNames(
  ctx: WriteContext,
  entries: readonly Ingredient[],
  keepName: string,
  absorbName: string,
): Promise<MergeError | null> {
  const plan = planMerge(ctx.spaceId, entries, keepName, absorbName);
  if ('error' in plan) return plan.error;
  await writeBatch(ctx, toBatch(plan.writes));
  return null;
}

/**
 * Remembers every merge a member confirmed at the grocery review. The merges are planned one after another, each
 * seeing the entries the earlier ones would make, and written together. A merge that is already known is skipped.
 */
export async function rememberMerges(
  ctx: WriteContext,
  entries: readonly Ingredient[],
  pairs: ReadonlyArray<{ keepName: string; absorbName: string }>,
): Promise<void> {
  const writes: CatalogWrite[] = [];
  let known: Ingredient[] = [...entries];
  for (const { keepName, absorbName } of pairs) {
    const plan = planMerge(ctx.spaceId, known, keepName, absorbName);
    if ('error' in plan) continue;
    writes.push(...plan.writes);
    known = applyPlanned(known, plan.writes, ctx);
  }
  await writeBatch(ctx, toBatch(writes));
}

/** What the entries would look like after the writes, so a later merge in the same batch plans against them. */
function applyPlanned(
  entries: Ingredient[],
  writes: CatalogWrite[],
  ctx: WriteContext,
): Ingredient[] {
  const next = [...entries];
  const now = new Date().toISOString();
  for (const write of writes) {
    if (write.op === 'insert') {
      next.push({
        id: write.id,
        spaceId: ctx.spaceId,
        creatorId: ctx.userId,
        name: write.input.name,
        matchKey: write.input.matchKey,
        aliases: [],
        mergedIntoId: write.input.mergedIntoId ?? null,
        staple: write.input.staple ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
    } else {
      const at = next.findIndex((entry) => entry.id === write.id);
      if (at >= 0) next[at] = { ...next[at], ...write.changes };
    }
  }
  return next;
}

export async function separateIngredient(
  ctx: WriteContext,
  entries: readonly Ingredient[],
  mergedId: string,
): Promise<void> {
  await writeBatch(ctx, toBatch(planSeparate(entries, mergedId)));
}

export async function renameIngredient(
  ctx: WriteContext,
  entries: readonly Ingredient[],
  id: string,
  name: string,
): Promise<void> {
  await writeBatch(ctx, toBatch(planRename(entries, id, name)));
}

/** Sets (or, with null, takes back) the household's call on whether an ingredient is a pantry staple. One write. */
export async function setIngredientStaple(
  ctx: WriteContext,
  entries: readonly Ingredient[],
  name: string,
  staple: boolean | null,
): Promise<void> {
  await writeBatch(ctx, toBatch(planSetStaple(ctx.spaceId, entries, name, staple)));
}

/** Sets the household's kcal, protein and grams per unit for an ingredient; null takes a value back to the table. One write. */
export async function setIngredientNutrition(
  ctx: WriteContext,
  entries: readonly Ingredient[],
  name: string,
  values: HouseholdNutrition,
): Promise<void> {
  await writeBatch(ctx, toBatch(planSetNutrition(ctx.spaceId, entries, name, values)));
}
