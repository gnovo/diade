import {
  type IngredientResolver,
  missingIngredients,
  type RecipeIngredient,
  withIngredientIds,
} from '@diade/domain';
import { getLocalDb } from '../storage/sqlite';
import { type WriteContext, writeBatch } from './repository';

/**
 * Makes sure the household's catalog has an entry for every ingredient in `lines`, and returns the lines
 * stamped with their entry's id. This is where a catalog entry is first made ("first use"): when a recipe is
 * saved or imported. The id is derived from the space and the resolved name, so two phones that add the same
 * ingredient make the same row, and a recipe saved before the catalog existed gets its ids the next time it is
 * saved.
 */
export async function stampIngredients(
  ctx: WriteContext,
  lines: RecipeIngredient[],
  resolver: IngredientResolver,
): Promise<RecipeIngredient[]> {
  const db = await getLocalDb();
  // Read straight from the table, not from a screen's copy: a pull may have just brought the row in.
  const existing = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM local_ingredients WHERE space_id = ?',
    [ctx.spaceId],
  );
  const missing = missingIngredients(
    ctx.spaceId,
    lines.map((line) => line.name),
    existing,
    resolver,
  );
  await writeBatch(
    ctx,
    missing.map((entry) => ({
      op: 'insert',
      entity: 'ingredients',
      id: entry.id,
      input: { name: entry.name, matchKey: entry.matchKey },
    })),
  );
  return withIngredientIds(ctx.spaceId, lines, resolver);
}
