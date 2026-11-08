/**
 * Keeping ingredient spelling consistent. A grocery list merges rows by name, so "meat" and "meet" stay two
 * rows. Nothing here merges anything: it only offers the names a household already uses while typing, and
 * points out a name that is one typo away from one it uses more.
 */

import { ingredientMatchKey } from './mealPlan';
import {
  assessIngredientLine,
  formatIngredient,
  normalizeIngredientName,
  type Recipe,
} from './recipes';

export interface KnownName {
  /** The spelling shown: the one used most. */
  name: string;
  /** How many recipes use it. */
  count: number;
}

/** Ingredient names across recipes, grouped like grocery rows (case, accent and plural insensitive). */
export function knownIngredientNames(recipes: Pick<Recipe, 'ingredients'>[]): KnownName[] {
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const recipe of recipes) {
    const seen = new Set<string>();
    for (const { name } of recipe.ingredients) {
      const key = ingredientMatchKey(name);
      if (!key) continue;
      const group = groups.get(key) ?? { spellings: new Map(), count: 0 };
      group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
      if (!seen.has(key)) group.count += 1;
      seen.add(key);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ spellings, count }) => ({
    name: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
    count,
  }));
}

/** Edits (insert, delete, substitute, swap two neighbours) to turn `a` into `b`. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...new Array<number>(b.length).fill(0),
  ]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }
  return rows[a.length][b.length];
}

const withoutVowels = (text: string): string => text.replace(/[aeiou]/g, '');
const sortedLetters = (text: string): string => [...text].sort().join('');

/**
 * Whether `other` is a plausible typo of `typed` (both normalized). Longer words allow one or two edits. Short
 * words (4 or 5 letters) allow only a vowel slip or a swap of neighbours: "meet" for "meat", but pear is not
 * peas, lime is not line, and beef is not beet.
 */
function isTypoOf(typed: string, other: string): boolean {
  if (typed.length < 4 || typed === other) return false;
  const edits = editDistance(typed, other);
  if (typed.length >= 9) return edits <= 2;
  if (edits > 1) return false;
  if (typed.length >= 6) return true;
  return (
    withoutVowels(typed) === withoutVowels(other) || sortedLetters(typed) === sortedLetters(other)
  );
}

/**
 * The name this household uses more often that `name` is a typo of, or null. `ownCount` is how many recipes
 * already use `name` itself: only a more common spelling is offered, so the typo is the one that gets flagged.
 */
export function similarKnownName(name: string, known: KnownName[], ownCount = 0): string | null {
  const typed = normalizeIngredientName(name);
  const key = ingredientMatchKey(name);
  let best: KnownName | null = null;
  for (const candidate of known) {
    if (candidate.count <= ownCount || ingredientMatchKey(candidate.name) === key) continue;
    if (!isTypoOf(typed, normalizeIngredientName(candidate.name))) continue;
    if (!best || candidate.count > best.count) best = candidate;
  }
  return best?.name ?? null;
}

/** The name being typed in an ingredient line ("1 kg me" -> "Me"), or null when there is none yet. */
function typedName(line: string): string | null {
  const { ingredient, flag } = assessIngredientLine(line);
  return flag === 'noName' || !ingredient.name ? null : ingredient.name;
}

/**
 * Names already in use that match what is being typed: those that start a word with it, then those a typo
 * away from it. Empty when the typed name is already one of them.
 */
export function suggestIngredientNames(line: string, known: KnownName[], limit = 4): string[] {
  const name = typedName(line);
  if (!name) return [];
  const typed = normalizeIngredientName(name);
  if (typed.length < 2) return [];
  const key = ingredientMatchKey(name);
  if (known.some((k) => ingredientMatchKey(k.name) === key)) return [];

  const byUse = [...known].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const starts = byUse.filter((k) =>
    normalizeIngredientName(k.name)
      .split(' ')
      .some((word) => word.startsWith(typed)),
  );
  const close = byUse.filter((k) => isTypoOf(typed, normalizeIngredientName(k.name)));
  return [...new Set([...starts, ...close].map((k) => k.name))].slice(0, limit);
}

/** The line with the name being typed replaced by `suggestion`, keeping the amount as it was written. */
export function applyNameSuggestion(line: string, suggestion: string): string {
  const { ingredient } = assessIngredientLine(line);
  const written = line.trimEnd();
  if (ingredient.name && written.toLowerCase().endsWith(ingredient.name.toLowerCase())) {
    return written.slice(0, written.length - ingredient.name.length) + suggestion;
  }
  return formatIngredient({ ...ingredient, name: suggestion });
}
