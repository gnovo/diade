import { describe, expect, it } from 'vitest';
import { createIngredientResolver, ingredientId } from './ingredientCatalog';
import { mergedGroups, planMerge, planRename, planSeparate } from './ingredientMerges';

const SPACE = '11111111-1111-4111-8111-111111111111';
const entry = (
  name: string,
  matchKey: string,
  id = ingredientId(SPACE, matchKey),
  mergedIntoId: string | null = null,
) => ({
  id,
  name,
  matchKey,
  aliases: [],
  mergedIntoId,
  deletedAt: null as string | null,
});

describe('planMerge', () => {
  it('makes an entry for each name and points the absorbed one at the kept one (two writes)', () => {
    const result = planMerge(SPACE, [], 'Meat', 'Meet');
    expect(result).toEqual({
      writes: [
        {
          op: 'insert',
          id: ingredientId(SPACE, 'meat'),
          input: { name: 'Meat', matchKey: 'meat' },
        },
        {
          op: 'insert',
          id: ingredientId(SPACE, 'meet'),
          input: { name: 'Meet', matchKey: 'meet', mergedIntoId: ingredientId(SPACE, 'meat') },
        },
      ],
    });
  });

  it('is one write when the kept name already has an entry, and an update when the absorbed one does', () => {
    const meat = entry('Meat', 'meat');
    expect(planMerge(SPACE, [meat], 'Meat', 'Meet')).toEqual({
      writes: [
        {
          op: 'insert',
          id: ingredientId(SPACE, 'meet'),
          input: { name: 'Meet', matchKey: 'meet', mergedIntoId: meat.id },
        },
      ],
    });
    const meet = entry('Meet', 'meet');
    expect(planMerge(SPACE, [meat, meet], 'Meat', 'Meet')).toEqual({
      writes: [{ op: 'update', id: meet.id, changes: { mergedIntoId: meat.id } }],
    });
  });

  it('merges into the end of the chain when the kept name is itself merged', () => {
    const beef = entry('Beef', 'beef');
    const meat = entry('Meat', 'meat', undefined, beef.id);
    const result = planMerge(SPACE, [beef, meat], 'Meat', 'Meet');
    expect(result).toEqual({
      writes: [
        {
          op: 'insert',
          id: ingredientId(SPACE, 'meet'),
          input: { name: 'Meet', matchKey: 'meet', mergedIntoId: beef.id },
        },
      ],
    });
  });

  it('refuses names that are empty or already one ingredient, including through the dictionary', () => {
    expect(planMerge(SPACE, [], 'Meat', '  ')).toEqual({ error: 'empty' });
    expect(planMerge(SPACE, [], 'Meat', 'meat')).toEqual({ error: 'same' });
    expect(planMerge(SPACE, [], 'Tomatoes', 'Tomate')).toEqual({ error: 'same' });
    const meat = entry('Meat', 'meat');
    const meet = entry('Meet', 'meet', undefined, meat.id);
    expect(planMerge(SPACE, [meat, meet], 'Meet', 'Meat')).toEqual({ error: 'same' });
  });

  it('after applying its writes the two names resolve to one ingredient', () => {
    const result = planMerge(SPACE, [], 'Meat', 'Meet');
    if ('error' in result) throw new Error('unexpected');
    const entries = result.writes.map((w) =>
      w.op === 'insert'
        ? {
            id: w.id,
            name: w.input.name,
            matchKey: w.input.matchKey,
            aliases: [],
            mergedIntoId: w.input.mergedIntoId ?? null,
            deletedAt: null,
          }
        : entry('x', 'x'),
    );
    const resolver = createIngredientResolver(entries);
    expect(resolver.key('Meet')).toBe(resolver.key('Meat'));
    expect(resolver.name(resolver.key('Meet'))).toBe('Meat');
  });
});

describe('planSeparate and planRename', () => {
  const meat = entry('Meat', 'meat');
  const meet = entry('Meet', 'meet', undefined, meat.id);

  it('separates a merged name, and does nothing for one that is not merged', () => {
    expect(planSeparate([meat, meet], meet.id)).toEqual([
      { op: 'update', id: meet.id, changes: { mergedIntoId: null } },
    ]);
    expect(planSeparate([meat, meet], meat.id)).toEqual([]);
    expect(planSeparate([meat, meet], 'unknown')).toEqual([]);
  });

  it('renames an entry, and ignores an empty or unchanged name', () => {
    expect(planRename([meat], meat.id, '  Beef mince ')).toEqual([
      { op: 'update', id: meat.id, changes: { name: 'Beef mince' } },
    ]);
    expect(planRename([meat], meat.id, 'Meat')).toEqual([]);
    expect(planRename([meat], meat.id, '   ')).toEqual([]);
    expect(planRename([meat], 'unknown', 'X')).toEqual([]);
  });
});

describe('mergedGroups', () => {
  it('groups merged names under the kept one, sorted, following chains', () => {
    const beef = entry('Beef', 'beef');
    const meat = entry('Meat', 'meat', undefined, beef.id);
    const meet = entry('Meet', 'meet', undefined, meat.id);
    const cheese = entry('Cheese', 'cheese');
    const queijo = entry('Queijo', 'queijo', undefined, cheese.id);
    const groups = mergedGroups([meet, queijo, beef, cheese, meat]);
    expect(groups.map((g) => [g.keep.name, g.merged.map((m) => m.name)])).toEqual([
      ['Beef', ['Meat', 'Meet']],
      ['Cheese', ['Queijo']],
    ]);
  });

  it('ignores deleted entries and merges whose target is missing', () => {
    const meat = entry('Meat', 'meat');
    const gone = {
      ...entry('Meet', 'meet', undefined, meat.id),
      deletedAt: '2026-11-01T00:00:00Z',
    };
    const orphan = entry('Orphan', 'orphan', undefined, 'missing-id');
    expect(mergedGroups([meat, gone])).toEqual([]);
    expect(mergedGroups([orphan])).toEqual([]);
  });
});
