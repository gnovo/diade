/**
 * Planning the catalog changes behind the "Ingredients" screen and the grocery review: merging two names,
 * separating them again, renaming. Each function only decides what to write (pure, tested); the app turns the
 * result into sync mutations. A merge is one or two mutations, never one per ingredient.
 */

import {
  createIngredientResolver,
  type HouseholdNutrition,
  type Ingredient,
  ingredientId,
} from './ingredientCatalog';
import { ingredientMatchKey } from './ingredientKeys';

type Entry = Pick<
  Ingredient,
  'id' | 'name' | 'matchKey' | 'aliases' | 'mergedIntoId' | 'deletedAt'
> & { staple?: boolean | null } & Partial<HouseholdNutrition>;

export type CatalogWrite =
  | {
      op: 'insert';
      id: string;
      input: {
        name: string;
        matchKey: string;
        mergedIntoId?: string | null;
        staple?: boolean | null;
      } & Partial<HouseholdNutrition>;
    }
  | {
      op: 'update';
      id: string;
      changes: {
        name?: string;
        mergedIntoId?: string | null;
        staple?: boolean | null;
      } & Partial<HouseholdNutrition>;
    };

export type MergeResult = { writes: CatalogWrite[] } | { error: 'empty' | 'same' };

const MAX_HOPS = 8;

/** The entry a merge chain ends at (itself when it is not merged into anything). */
function rootOf(entry: Entry, byId: ReadonlyMap<string, Entry>): Entry {
  let current = entry;
  for (let hop = 0; hop < MAX_HOPS && current.mergedIntoId; hop++) {
    const next = byId.get(current.mergedIntoId);
    if (!next) break;
    current = next;
  }
  return current;
}

/**
 * Writes that make `absorbName` one ingredient with `keepName`. An entry is made for each name that has none
 * (the kept one first), and the absorbed one is pointed at the kept one. If the kept name is itself already
 * merged into another, the merge goes to the end of that chain. `same` when the two already resolve to one
 * ingredient (including through the built-in dictionary), so nothing is written twice.
 */
export function planMerge(
  spaceId: string,
  entries: readonly Entry[],
  keepName: string,
  absorbName: string,
): MergeResult {
  const keepKey = ingredientMatchKey(keepName);
  const absorbKey = ingredientMatchKey(absorbName);
  if (!keepKey || !absorbKey) return { error: 'empty' };

  const resolver = createIngredientResolver(entries);
  if (resolver.key(keepName) === resolver.key(absorbName)) return { error: 'same' };

  const live = entries.filter((entry) => !entry.deletedAt);
  const byId = new Map(live.map((entry) => [entry.id, entry]));
  const byKey = new Map(live.map((entry) => [entry.matchKey, entry]));
  const writes: CatalogWrite[] = [];

  const keepEntry = byKey.get(keepKey);
  const target = keepEntry ? rootOf(keepEntry, byId) : null;
  let targetId = target?.id ?? null;
  if (!targetId) {
    targetId = ingredientId(spaceId, keepKey);
    writes.push({
      op: 'insert',
      id: targetId,
      input: { name: keepName.trim(), matchKey: keepKey },
    });
  }

  const absorbEntry = byKey.get(absorbKey);
  if (absorbEntry) {
    writes.push({ op: 'update', id: absorbEntry.id, changes: { mergedIntoId: targetId } });
  } else {
    writes.push({
      op: 'insert',
      id: ingredientId(spaceId, absorbKey),
      input: { name: absorbName.trim(), matchKey: absorbKey, mergedIntoId: targetId },
    });
  }
  return { writes };
}

/** Undoes a merge: the name stands on its own again. Nothing to write when it was not merged. */
export function planSeparate(entries: readonly Entry[], mergedId: string): CatalogWrite[] {
  const entry = entries.find((e) => e.id === mergedId && !e.deletedAt);
  return entry?.mergedIntoId
    ? [{ op: 'update', id: entry.id, changes: { mergedIntoId: null } }]
    : [];
}

/** Renames an ingredient's catalog entry; nothing to write for an empty or unchanged name. */
export function planRename(entries: readonly Entry[], id: string, name: string): CatalogWrite[] {
  const next = name.trim();
  const entry = entries.find((e) => e.id === id && !e.deletedAt);
  return entry && next && next !== entry.name
    ? [{ op: 'update', id, changes: { name: next } }]
    : [];
}

/**
 * Sets the household's own call on whether an ingredient is a pantry staple (null takes it back, so the recipe lines
 * decide again). The call is kept on the ingredient the name resolves to, so a name merged into another shares its
 * setting. One write; nothing when it is already so, or when there is nothing to take back.
 */
export function planSetStaple(
  spaceId: string,
  entries: readonly Entry[],
  name: string,
  staple: boolean | null,
): CatalogWrite[] {
  const key = createIngredientResolver(entries).key(name);
  if (!key) return [];
  const entry = entries.find((e) => !e.deletedAt && e.matchKey === key);
  if (entry) {
    return (entry.staple ?? null) === staple
      ? []
      : [{ op: 'update', id: entry.id, changes: { staple } }];
  }
  if (staple === null) return [];
  return [
    {
      op: 'insert',
      id: ingredientId(spaceId, key),
      input: { name: name.trim(), matchKey: key, staple },
    },
  ];
}

const NO_NUTRITION: HouseholdNutrition = {
  kcalPer100g: null,
  proteinPer100g: null,
  gramsPerUnit: null,
};

/**
 * Sets the household's nutrition values for an ingredient (null takes one back to the built-in table). Updates
 * its catalog entry, or creates one when it has none and a value is set. One write at most.
 */
export function planSetNutrition(
  spaceId: string,
  entries: readonly Entry[],
  name: string,
  values: HouseholdNutrition,
): CatalogWrite[] {
  const key = createIngredientResolver(entries).key(name);
  if (!key) return [];
  const entry = entries.find((e) => !e.deletedAt && e.matchKey === key);
  if (entry) {
    const current: HouseholdNutrition = {
      kcalPer100g: entry.kcalPer100g ?? null,
      proteinPer100g: entry.proteinPer100g ?? null,
      gramsPerUnit: entry.gramsPerUnit ?? null,
    };
    const same = (Object.keys(values) as Array<keyof HouseholdNutrition>).every(
      (field) => current[field] === values[field],
    );
    return same ? [] : [{ op: 'update', id: entry.id, changes: { ...values } }];
  }
  if (Object.values(values).every((value) => value === null)) return [];
  return [
    {
      op: 'insert',
      id: ingredientId(spaceId, key),
      input: { name: name.trim(), matchKey: key, ...NO_NUTRITION, ...values },
    },
  ];
}

export interface MergedGroup {
  keep: Entry;
  /** The names merged into it, by name. */
  merged: Entry[];
}

/** The merges to show: each kept ingredient with the names merged into it, by the kept name. */
export function mergedGroups(entries: readonly Entry[]): MergedGroup[] {
  const live = entries.filter((entry) => !entry.deletedAt);
  const byId = new Map(live.map((entry) => [entry.id, entry]));
  const groups = new Map<string, MergedGroup>();
  for (const entry of live) {
    if (!entry.mergedIntoId) continue;
    const root = rootOf(entry, byId);
    if (root.id === entry.id) continue;
    const group = groups.get(root.id) ?? { keep: root, merged: [] };
    group.merged.push(entry);
    groups.set(root.id, group);
  }
  const byName = (a: Entry, b: Entry) => a.name.localeCompare(b.name);
  return [...groups.values()]
    .map((group) => ({ ...group, merged: [...group.merged].sort(byName) }))
    .sort((a, b) => byName(a.keep, b.keep));
}
