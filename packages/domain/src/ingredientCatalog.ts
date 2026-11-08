/**
 * The ingredient catalog: what the grocery list uses to decide that two written names are one ingredient.
 *
 * A name is resolved in three steps: the household's own catalog (a name merged into another, or an alias a
 * member confirmed), then the built-in dictionary (`ingredientDictionary.ts`), then the catalog once more for
 * the name the dictionary gave back. Two passes, so it always ends. A name nothing knows resolves to its own
 * match key, exactly as it did before there was a catalog, so existing lists keep the keys they were made with.
 */

import { INGREDIENT_SYNONYMS } from './ingredientDictionary';
import { ingredientMatchKey } from './ingredientKeys';

/** An ingredient the household has in its catalog; one row per match key, shared by both members. */
export interface Ingredient {
  id: string;
  spaceId: string;
  creatorId: string;
  /** The name shown: the spelling used when it was first added. */
  name: string;
  /** `ingredientMatchKey(name)`: unique within the space. */
  matchKey: string;
  /** Other names for it, as match keys. */
  aliases: string[];
  /** Set when a member merged this one into another: it then resolves to that ingredient. */
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type CatalogEntry = Pick<
  Ingredient,
  'id' | 'matchKey' | 'aliases' | 'mergedIntoId' | 'deletedAt'
> & {
  /** The name shown; entries that only redirect (tests, older callers) may leave it out. */
  name?: string;
};

export interface IngredientResolver {
  /** The match key a written name resolves to: what grocery rows are grouped by. */
  key(name: string): string;
  /** A stored match key mapped to the one it resolves to now (a list made before an alias was known). */
  canonicalKey(matchKey: string): string;
  /** A stored row key, `matchKey|family`, with its match key resolved. */
  canonicalRowKey(rowKey: string): string;
  /** The name the household gave an ingredient (its catalog entry), or null when it has none: then the written name is used. */
  name(matchKey: string): string | null;
}

/** Dictionary: every spelling's match key to the match key of its group's first name. */
const DICTIONARY: ReadonlyMap<string, string> = new Map(
  INGREDIENT_SYNONYMS.flatMap((group) => {
    const canonical = ingredientMatchKey(group[0]);
    return group.map((name): [string, string] => [ingredientMatchKey(name), canonical]);
  }),
);

/** At most this many hops follow a merge through the catalog: a cycle cannot loop forever. */
const MAX_HOPS = 8;

/** The household's redirects: match key to the match key it resolves to (a merge, or an alias). */
function catalogRedirects(entries: readonly CatalogEntry[]): Map<string, string> {
  const live = entries.filter((entry) => !entry.deletedAt);
  const byId = new Map(live.map((entry) => [entry.id, entry]));
  const redirects = new Map<string, string>();
  for (const entry of live) {
    let target = entry;
    for (let hop = 0; hop < MAX_HOPS && target.mergedIntoId; hop++) {
      const next = byId.get(target.mergedIntoId);
      if (!next) break;
      target = next;
    }
    if (target.matchKey !== entry.matchKey) redirects.set(entry.matchKey, target.matchKey);
    for (const alias of entry.aliases) {
      const key = ingredientMatchKey(alias);
      if (key !== target.matchKey && !redirects.has(key)) redirects.set(key, target.matchKey);
    }
  }
  return redirects;
}

export function createIngredientResolver(
  entries: readonly CatalogEntry[] = [],
): IngredientResolver {
  const redirects = catalogRedirects(entries);
  const names = new Map(
    entries.flatMap((entry) =>
      !entry.deletedAt && entry.name ? [[entry.matchKey, entry.name] as [string, string]] : [],
    ),
  );
  const canonicalKey = (matchKey: string): string => {
    const once = redirects.get(matchKey) ?? matchKey;
    const named = DICTIONARY.get(once) ?? once;
    return redirects.get(named) ?? named;
  };
  return {
    key: (name) => canonicalKey(ingredientMatchKey(name)),
    canonicalKey,
    canonicalRowKey: (rowKey) => {
      const bar = rowKey.lastIndexOf('|');
      return bar < 0
        ? canonicalKey(rowKey)
        : `${canonicalKey(rowKey.slice(0, bar))}${rowKey.slice(bar)}`;
    },
    name: (matchKey) => names.get(matchKey) ?? null,
  };
}

/** The built-in dictionary alone: what every list gets before a household has a catalog of its own. */
export const DEFAULT_RESOLVER: IngredientResolver = createIngredientResolver();

// --- Ids ---

/**
 * A 32-bit string hash (cyrb53-style) run four times with different seeds: 128 bits, not for secrecy, only so
 * the same input always gives the same output on every phone.
 */
function hash128(text: string): number[] {
  const out: number[] = [];
  for (let seed = 0; seed < 4; seed++) {
    let h1 = 0xdeadbeef ^ (seed * 0x9e3779b1);
    let h2 = 0x41c6ce57 ^ (seed * 0x85ebca6b);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 2654435761);
      h2 = Math.imul(h2 ^ code, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    out.push((h1 ^ h2) >>> 0);
  }
  return out;
}

/**
 * The id of the catalog entry for a match key in a space. It is derived, not random, so two phones that add
 * the same ingredient at the same moment make the same row: the second insert is a no-op on the server and
 * the catalog never holds an ingredient twice. Shaped like a v4 UUID so it passes the sync schemas.
 */
export function ingredientId(spaceId: string, matchKey: string): string {
  const hex = hash128(`${spaceId}\u0000${matchKey}`)
    .map((part) => part.toString(16).padStart(8, '0'))
    .join('');
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
