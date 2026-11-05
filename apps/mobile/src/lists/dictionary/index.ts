import type { ListCategory } from '@diade/domain';
import { en } from './en';
import { ptPT } from './pt-PT';

/** Built-in vocabulary for a category in the user's language; unknown languages get English. */
export function dictionaryFor(language: string, category: ListCategory): string[] {
  const table = language.toLowerCase().startsWith('pt') ? ptPT : en;
  // "Other" lists have no vocabulary of their own and rely on the couple's history.
  return table[category];
}
