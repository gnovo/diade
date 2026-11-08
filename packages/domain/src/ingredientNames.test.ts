import { describe, expect, it } from 'vitest';
import {
  applyNameSuggestion,
  type KnownName,
  knownIngredientNames,
  similarKnownName,
  suggestIngredientNames,
} from './ingredientNames';

const recipe = (...names: string[]) => ({
  ingredients: names.map((name, i) => ({
    id: String(i),
    name,
    quantity: 1,
    unit: 'unit' as const,
    staple: false,
  })),
});

const known: KnownName[] = [
  { name: 'Meat', count: 3 },
  { name: 'Chicken breast', count: 2 },
  { name: 'Tomatoes', count: 2 },
  { name: 'Peas', count: 1 },
  { name: 'Olive oil', count: 1 },
];

describe('knownIngredientNames', () => {
  it('counts recipes, not rows, and groups spellings the way a grocery list does', () => {
    const names = knownIngredientNames([
      recipe('Meat', 'Meat'),
      recipe('meat', 'Onion'),
      recipe('Meats'),
      recipe('Cebola'),
    ]);
    expect(names.find((n) => n.name === 'Meat')).toEqual({ name: 'Meat', count: 3 });
    expect(names).toHaveLength(3);
  });
});

describe('similarKnownName', () => {
  it('finds the more common spelling a typo is one edit from', () => {
    expect(similarKnownName('Meet', known)).toBe('Meat');
    expect(similarKnownName('Tomatos', known)).toBe('Tomatoes');
    expect(similarKnownName('Chiken breast', known)).toBe('Chicken breast');
    expect(similarKnownName('Olive oli', known)).toBe('Olive oil');
  });

  it('does not offer a name for itself, a plural of it, or a name as common as it is', () => {
    expect(similarKnownName('Meat', known, 3)).toBeNull();
    expect(similarKnownName('Meats', known)).toBeNull();
    expect(similarKnownName('Meet', known, 3)).toBeNull();
  });

  it('leaves short words and unrelated names alone: pea is not pear', () => {
    expect(similarKnownName('Pear', known)).toBeNull();
    expect(similarKnownName('Fish', known)).toBeNull();
    expect(similarKnownName('Bacon', known)).toBeNull();
  });
});

describe('suggestIngredientNames', () => {
  const line = (text: string) => suggestIngredientNames(text, known);

  it('offers names that start a word with what is typed, most used first', () => {
    expect(line('1 kg me')).toEqual(['Meat']);
    expect(line('breast')).toEqual(['Chicken breast']);
    expect(line('2 tom')).toEqual(['Tomatoes']);
  });

  it('offers the right spelling for a typo', () => {
    expect(line('1 kg meet')).toEqual(['Meat']);
  });

  it('offers nothing once the name is one in use, or while there is no name', () => {
    expect(line('1 kg meat')).toEqual([]);
    expect(line('1 kg meats')).toEqual([]);
    expect(line('1 kg')).toEqual([]);
    expect(line('')).toEqual([]);
    expect(line('m')).toEqual([]);
  });
});

describe('applyNameSuggestion', () => {
  it('replaces the name and keeps the amount as written', () => {
    expect(applyNameSuggestion('1 kg meet', 'Meat')).toBe('1 kg Meat');
    expect(applyNameSuggestion('1 lb me', 'Meat')).toBe('1 lb Meat');
    expect(applyNameSuggestion('2 colheres de sopa de azeit', 'Azeite')).toBe(
      '2 colheres de sopa de Azeite',
    );
  });
});
