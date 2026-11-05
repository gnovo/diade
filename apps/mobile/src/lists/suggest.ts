import { normalizeText } from './normalize';

export interface HistoryEntry {
  name: string;
  count: number;
  /** ISO timestamp of the most recent time the item was added. */
  lastUsedAt: string;
}

export interface ExistingItem {
  id: string;
  name: string;
  isChecked: boolean;
}

export interface Suggestion {
  name: string;
  source: 'history' | 'dictionary';
  /** Set when the item is already on the list, checked: choosing it unchecks that row. */
  reAddItemId?: string;
}

interface Candidate {
  name: string;
  norm: string;
  source: 'history' | 'dictionary';
  count: number;
  lastUsedAt: string;
  /** Position in the dictionary, so its curated order survives as the tie-break. */
  rank: number;
}

export interface SuggestInput {
  query: string;
  history: readonly HistoryEntry[];
  dictionary: readonly string[];
  existing: readonly ExistingItem[];
  limit?: number;
}

const DEFAULT_LIMIT = 6;
const FUZZY_MIN_LENGTH = 4;

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true; // differ by one trailing character
  // One substitution, insertion, deletion or adjacent swap from here.
  if (a.slice(i + 1) === b.slice(i + 1)) return true;
  if (a.slice(i + 1) === b.slice(i)) return true;
  if (a.slice(i) === b.slice(i + 1)) return true;
  return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

/** 0 = prefix, 1 = a later word starts with it, 2 = within one typo, null = no match. */
function matchTier(query: string, norm: string): 0 | 1 | 2 | null {
  if (norm.startsWith(query)) return 0;
  const words = norm.split(' ');
  if (words.slice(1).some((w) => w.startsWith(query))) return 1;
  if (query.length >= FUZZY_MIN_LENGTH) {
    for (const word of words) {
      if (withinOneEdit(query, word.slice(0, query.length))) return 2;
      if (withinOneEdit(query, word)) return 2;
    }
  }
  return null;
}

function buildCandidates(history: readonly HistoryEntry[], dictionary: readonly string[]): Map<string, Candidate> {
  const byName = new Map<string, Candidate>();
  for (const entry of history) {
    const norm = normalizeText(entry.name);
    if (!norm) continue;
    const prior = byName.get(norm);
    if (prior) {
      prior.count += entry.count;
      if (entry.lastUsedAt > prior.lastUsedAt) {
        prior.lastUsedAt = entry.lastUsedAt;
        prior.name = entry.name;
      }
    } else {
      byName.set(norm, { name: entry.name, norm, source: 'history', count: entry.count, lastUsedAt: entry.lastUsedAt, rank: 0 });
    }
  }
  dictionary.forEach((name, rank) => {
    const norm = normalizeText(name);
    if (norm && !byName.has(norm)) {
      byName.set(norm, { name, norm, source: 'dictionary', count: 0, lastUsedAt: '', rank });
    }
  });
  return byName;
}

/**
 * Ranks what to suggest while typing. History beats the built-in dictionary, and within
 * either, prefix matches beat word-start matches beat one-typo matches. Items already on
 * the list are left out, except checked ones, which come back as "add again".
 */
export function suggest({ query, history, dictionary, existing, limit = DEFAULT_LIMIT }: SuggestInput): Suggestion[] {
  const q = normalizeText(query);
  const candidates = buildCandidates(history, dictionary);

  const open = new Set<string>();
  const checked = new Map<string, string>();
  for (const item of existing) {
    const norm = normalizeText(item.name);
    if (item.isChecked) checked.set(norm, item.id);
    else open.add(norm);
  }

  const ranked: { candidate: Candidate; tier: number }[] = [];
  for (const candidate of candidates.values()) {
    if (open.has(candidate.norm)) continue;
    if (q === '') {
      ranked.push({ candidate, tier: 0 });
      continue;
    }
    const tier = matchTier(q, candidate.norm);
    if (tier !== null) ranked.push({ candidate, tier });
  }

  ranked.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.candidate.source !== b.candidate.source) return a.candidate.source === 'history' ? -1 : 1;
    if (a.candidate.count !== b.candidate.count) return b.candidate.count - a.candidate.count;
    if (a.candidate.lastUsedAt !== b.candidate.lastUsedAt) return a.candidate.lastUsedAt < b.candidate.lastUsedAt ? 1 : -1;
    if (a.candidate.rank !== b.candidate.rank) return a.candidate.rank - b.candidate.rank;
    return a.candidate.name.localeCompare(b.candidate.name);
  });

  return ranked.slice(0, limit).map(({ candidate }) => {
    const reAddItemId = checked.get(candidate.norm);
    return {
      name: candidate.name,
      source: candidate.source,
      ...(reAddItemId ? { reAddItemId } : {}),
    };
  });
}
