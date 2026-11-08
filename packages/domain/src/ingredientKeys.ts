/**
 * The match key of an ingredient name: what two spellings are compared by. Kept in a module of its own because
 * both the grocery list and the ingredient catalog need it, and each imports the other's results.
 */
import { normalizeIngredientName } from './recipes';

/**
 * One word to its singular form, for matching only (the name that is shown is never changed). The rule
 * is deliberately conservative: it drops a single trailing "s" and nothing else, so `egg`/`eggs`
 * and `ovo`/`ovos` meet. Words of three letters or fewer, and words ending in "ss", "us" or "is"
 * (`hummus`, `couscous`, `asparagus`), are left alone. Irregular plurals (`peach`/`peaches`, `pão`/`pães`) are not merged by
 * this rule: two rows are better than a wrong merge. The common ones (`tomato`/`tomatoes`) and synonyms
 * (`aubergine`/`eggplant`) are joined by the dictionary in `ingredientDictionary.ts`.
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
