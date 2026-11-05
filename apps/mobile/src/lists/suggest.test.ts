import { describe, it, expect } from 'vitest';
import { suggest, type HistoryEntry } from './suggest';

const h = (name: string, count: number, lastUsedAt = '2026-01-01T00:00:00Z'): HistoryEntry => ({ name, count, lastUsedAt });
const names = (r: ReturnType<typeof suggest>) => r.map((s) => s.name);

const dictionary = ['Milk', 'Bread', 'Butter', 'Oat milk', 'Apples'];

describe('suggest', () => {
  it('matches by prefix, ignoring case', () => {
    expect(names(suggest({ query: 'BU', history: [], dictionary, existing: [] }))).toEqual(['Butter']);
  });

  it('matches without diacritics', () => {
    const result = suggest({ query: 'acucar', history: [], dictionary: ['Açúcar', 'Arroz'], existing: [] });
    expect(names(result)).toEqual(['Açúcar']);
  });

  it('ranks prefix matches before word-start matches', () => {
    expect(names(suggest({ query: 'milk', history: [], dictionary, existing: [] }))).toEqual(['Milk', 'Oat milk']);
  });

  it('ranks history above the dictionary within a tier', () => {
    const result = suggest({ query: 'b', history: [h('Beans', 1)], dictionary, existing: [] });
    expect(result[0]).toMatchObject({ name: 'Beans', source: 'history' });
    expect(names(result)).toEqual(['Beans', 'Bread', 'Butter']);
  });

  it('ranks by frequency, then recency', () => {
    const history = [h('Banana', 2, '2026-03-01T00:00:00Z'), h('Basil', 5, '2026-01-01T00:00:00Z'), h('Bacon', 2, '2026-04-01T00:00:00Z')];
    expect(names(suggest({ query: 'ba', history, dictionary: [], existing: [] }))).toEqual(['Basil', 'Bacon', 'Banana']);
  });

  it('merges history entries that differ only by case or accents', () => {
    const history = [h('Café', 1, '2026-01-01T00:00:00Z'), h('cafe', 2, '2026-02-01T00:00:00Z')];
    const result = suggest({ query: 'caf', history, dictionary: [], existing: [] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('cafe'); // most recent spelling wins
  });

  it('tolerates a single typo for longer queries', () => {
    expect(names(suggest({ query: 'buter', history: [], dictionary, existing: [] }))).toEqual(['Butter']);
    expect(names(suggest({ query: 'brad', history: [], dictionary, existing: [] }))).toEqual(['Bread']);
    expect(names(suggest({ query: 'aplpes', history: [], dictionary, existing: [] }))).toEqual(['Apples']);
  });

  it('does not fuzzy match short queries', () => {
    expect(names(suggest({ query: 'bx', history: [], dictionary, existing: [] }))).toEqual([]);
  });

  it('leaves out items that are already open on the list', () => {
    const existing = [{ id: '1', name: 'milk', isChecked: false }];
    // "Oat milk" still matches by word start; plain "Milk" is on the list already.
    expect(names(suggest({ query: 'mi', history: [], dictionary, existing }))).toEqual(['Oat milk']);
  });

  it('offers checked items again, pointing at the existing row', () => {
    const existing = [{ id: 'abc', name: 'Milk', isChecked: true }];
    const result = suggest({ query: 'mi', history: [], dictionary, existing });
    expect(result[0]).toMatchObject({ name: 'Milk', reAddItemId: 'abc' });
  });

  it('shows frequent history first for an empty query, then dictionary starters', () => {
    const history = [h('Eggs', 3), h('Coffee', 9)];
    expect(names(suggest({ query: '', history, dictionary, existing: [], limit: 4 }))).toEqual(['Coffee', 'Eggs', 'Milk', 'Bread']);
  });

  it('falls back to the dictionary when there is no history', () => {
    expect(names(suggest({ query: '  ', history: [], dictionary, existing: [], limit: 2 }))).toEqual(['Milk', 'Bread']);
  });

  it('respects the limit', () => {
    expect(suggest({ query: '', history: [], dictionary, existing: [], limit: 3 })).toHaveLength(3);
  });
});
