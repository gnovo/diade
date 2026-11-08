import type { RecipeInput } from '@diade/domain';
import { type WriteContext, writeBatch } from './repository';

/** Saves every imported recipe in one transaction, so a failure leaves none of them half-saved. */
export async function importRecipes(ctx: WriteContext, recipes: RecipeInput[]): Promise<void> {
  await writeBatch(
    ctx,
    recipes.map((input) => ({ op: 'insert', entity: 'recipes', input })),
  );
}
