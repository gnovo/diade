import { createIngredientResolver, type Ingredient, type IngredientResolver } from '@diade/domain';
import { useMemo } from 'react';
import { getActiveIngredients } from './queries';
import { useLiveQuery } from './useLiveQuery';

const NONE: Ingredient[] = [];

/**
 * The household's ingredient catalog and the resolver built from it. Before the catalog has loaded (or when it
 * is empty) the resolver is the built-in dictionary alone, so a list is never built without one.
 */
export function useIngredientCatalog(): { entries: Ingredient[]; resolver: IngredientResolver } {
  const { data } = useLiveQuery(getActiveIngredients, NONE);
  const resolver = useMemo(() => createIngredientResolver(data), [data]);
  return { entries: data, resolver };
}
