import type { IngredientResolver, RecipeInput } from '@diade/domain';
import { stampIngredients } from './ingredientActions';
import { type WriteContext, writeBatch } from './repository';

/** Saves every imported recipe in one transaction, so a failure leaves none of them half-saved. */
export async function importRecipes(
  ctx: WriteContext,
  recipes: RecipeInput[],
  resolver: IngredientResolver,
): Promise<void> {
  // The catalog entries the recipes need are made first, then every recipe in one batch.
  const stamped: RecipeInput[] = [];
  for (const input of recipes) {
    stamped.push({
      ...input,
      ingredients: await stampIngredients(ctx, input.ingredients, resolver),
    });
  }
  await writeBatch(
    ctx,
    stamped.map((input) => ({ op: 'insert', entity: 'recipes', input })),
  );
}
