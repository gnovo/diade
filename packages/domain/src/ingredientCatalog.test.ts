import { describe, expect, it } from 'vitest';
import {
  type CatalogEntry,
  createIngredientResolver,
  DEFAULT_RESOLVER,
  ingredientId,
} from './ingredientCatalog';
import { INGREDIENT_SYNONYMS } from './ingredientDictionary';
import { ingredientMatchKey } from './ingredientKeys';

const entry = (
  over: Partial<CatalogEntry> & Pick<CatalogEntry, 'id' | 'matchKey'>,
): CatalogEntry => ({
  aliases: [],
  mergedIntoId: null,
  deletedAt: null,
  ...over,
});

describe('the built-in dictionary', () => {
  it('joins synonyms and plurals the simple plural rule misses, in both languages', () => {
    const key = (name: string) => DEFAULT_RESOLVER.key(name);
    expect(key('Tomatoes')).toBe(key('tomato'));
    expect(key('Tomate')).toBe(key('tomato'));
    expect(key('Eggplant')).toBe(key('Aubergine'));
    expect(key('Beringelas')).toBe(key('aubergine'));
    expect(key('Cebola')).toBe(key('Onions'));
    expect(key('Azeite')).toBe(key('Olive oil'));
    expect(key('Açúcar')).toBe(key('sugar'));
    expect(key('Grão de bico')).toBe(key('chickpeas'));
  });

  it('leaves a name it does not know as it was: accent, case and plural only', () => {
    expect(DEFAULT_RESOLVER.key('Red lentils')).toBe(ingredientMatchKey('Red lentils'));
    expect(DEFAULT_RESOLVER.key('Lentilhas')).toBe(ingredientMatchKey('lentilhas'));
  });

  it('does not join names that only look alike, or ones that mean two things', () => {
    expect(DEFAULT_RESOLVER.key('Pepper')).not.toBe(DEFAULT_RESOLVER.key('Black pepper'));
    expect(DEFAULT_RESOLVER.key('Massa')).not.toBe(DEFAULT_RESOLVER.key('Pasta'));
    expect(DEFAULT_RESOLVER.key('Beef')).not.toBe(DEFAULT_RESOLVER.key('Beet'));
  });

  it('puts every spelling in one group only', () => {
    const owner = new Map<string, string>();
    for (const group of INGREDIENT_SYNONYMS) {
      for (const name of group) {
        const key = ingredientMatchKey(name);
        const first = owner.get(key);
        expect(first === undefined || first === group[0], `${name} is in two groups`).toBe(true);
        owner.set(key, group[0]);
      }
    }
  });
});

describe('the household catalog', () => {
  const meat = entry({ id: 'm', matchKey: 'meat' });
  const meet = entry({ id: 't', matchKey: 'meet', mergedIntoId: 'm' });

  it('resolves a merged name to the ingredient it was merged into', () => {
    const resolver = createIngredientResolver([meat, meet]);
    expect(resolver.key('Meet')).toBe('meat');
    expect(resolver.key('Meat')).toBe('meat');
    expect(DEFAULT_RESOLVER.key('Meet')).toBe('meet');
  });

  it('resolves an alias a member confirmed', () => {
    const resolver = createIngredientResolver([
      entry({ id: 'x', matchKey: 'meat', aliases: ['Mince'] }),
    ]);
    expect(resolver.key('Mince')).toBe('meat');
  });

  it('follows a chain of merges, and survives a cycle', () => {
    const chain = [
      entry({ id: 'a', matchKey: 'a', mergedIntoId: 'b' }),
      entry({ id: 'b', matchKey: 'b', mergedIntoId: 'c' }),
      entry({ id: 'c', matchKey: 'c' }),
    ];
    expect(createIngredientResolver(chain).key('a')).toBe('c');
    const loop = [
      entry({ id: 'a', matchKey: 'a', mergedIntoId: 'b' }),
      entry({ id: 'b', matchKey: 'b', mergedIntoId: 'a' }),
    ];
    expect(() => createIngredientResolver(loop).key('a')).not.toThrow();
  });

  it('ignores a deleted entry', () => {
    const resolver = createIngredientResolver([
      meat,
      entry({ id: 't', matchKey: 'meet', mergedIntoId: 'm', deletedAt: '2026-11-01T00:00:00Z' }),
    ]);
    expect(resolver.key('Meet')).toBe('meet');
  });

  it('prefers the household over the dictionary, then the dictionary over a bare name', () => {
    // The household says eggplant is an aubergine already (dictionary) and merged aubergine into zucchini-like "veg".
    const resolver = createIngredientResolver([
      entry({ id: 'v', matchKey: 'veg' }),
      entry({ id: 'a', matchKey: ingredientMatchKey('aubergine'), mergedIntoId: 'v' }),
    ]);
    expect(resolver.key('Eggplant')).toBe('veg');
  });

  it('resolves a stored row key, keeping its unit family', () => {
    const resolver = createIngredientResolver([meat, meet]);
    expect(resolver.canonicalRowKey('meet|mass')).toBe('meat|mass');
    expect(resolver.canonicalRowKey('eggplant|count')).toBe(
      `${DEFAULT_RESOLVER.key('aubergine')}|count`,
    );
    expect(resolver.canonicalRowKey('flour|mass')).toBe('flour|mass');
  });
});

describe('ingredientId', () => {
  const space = '11111111-1111-4111-8111-111111111111';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('is the same for the same space and name, and a valid UUID', () => {
    expect(ingredientId(space, 'meat')).toBe(ingredientId(space, 'meat'));
    expect(ingredientId(space, 'meat')).toMatch(uuid);
  });

  it('differs by name and by space', () => {
    expect(ingredientId(space, 'meat')).not.toBe(ingredientId(space, 'meet'));
    expect(ingredientId(space, 'meat')).not.toBe(
      ingredientId('22222222-2222-4222-8222-222222222222', 'meat'),
    );
  });

  it('does not collide across the dictionary', () => {
    const ids = new Set(
      INGREDIENT_SYNONYMS.flat().map((n) => ingredientId(space, ingredientMatchKey(n))),
    );
    expect(ids.size).toBe(new Set(INGREDIENT_SYNONYMS.flat().map(ingredientMatchKey)).size);
  });
});
