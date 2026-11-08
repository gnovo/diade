import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatIngredient,
  ingredientFromLine,
  isLikelyStaple,
  parseIngredientLine,
  parseQuantityNumber,
} from './recipes';

describe('parseQuantityNumber', () => {
  it('reads decimals, fractions, mixed numbers and vulgar fractions', () => {
    expect(parseQuantityNumber('400')).toBe(400);
    expect(parseQuantityNumber('1,5')).toBe(1.5);
    expect(parseQuantityNumber('1.5')).toBe(1.5);
    expect(parseQuantityNumber('1/2')).toBe(0.5);
    expect(parseQuantityNumber('1 1/2')).toBe(1.5);
    expect(parseQuantityNumber('½')).toBe(0.5);
    expect(parseQuantityNumber('1½')).toBe(1.5);
  });

  it('rejects text and a zero denominator', () => {
    expect(parseQuantityNumber('abc')).toBeNull();
    expect(parseQuantityNumber('1/0')).toBeNull();
  });
});

describe('parseIngredientLine', () => {
  it('reads a metric weight with or without a space', () => {
    expect(parseIngredientLine('400 g spaghetti')).toEqual({
      name: 'Spaghetti',
      quantity: 400,
      unit: 'g',
    });
    expect(parseIngredientLine('400g spaghetti')).toEqual({
      name: 'Spaghetti',
      quantity: 400,
      unit: 'g',
    });
    expect(parseIngredientLine('1.5 kg potatoes')).toEqual({
      name: 'Potatoes',
      quantity: 1.5,
      unit: 'kg',
    });
  });

  it('reads volumes and spoons', () => {
    expect(parseIngredientLine('250 ml milk')).toEqual({
      name: 'Milk',
      quantity: 250,
      unit: 'ml',
    });
    expect(parseIngredientLine('1,5 l water')).toEqual({
      name: 'Water',
      quantity: 1.5,
      unit: 'l',
    });
    expect(parseIngredientLine('2 tbsp olive oil')).toEqual({
      name: 'Olive oil',
      quantity: 2,
      unit: 'tbsp',
    });
    expect(parseIngredientLine('1/2 tsp salt')).toEqual({
      name: 'Salt',
      quantity: 0.5,
      unit: 'tsp',
    });
  });

  it('reads Portuguese units and drops the "de" that follows them', () => {
    expect(parseIngredientLine('2 colheres de sopa de azeite')).toEqual({
      name: 'Azeite',
      quantity: 2,
      unit: 'tbsp',
    });
    expect(parseIngredientLine('1 colher de chá de sal')).toEqual({
      name: 'Sal',
      quantity: 1,
      unit: 'tsp',
    });
    expect(parseIngredientLine('200 g de arroz')).toEqual({
      name: 'Arroz',
      quantity: 200,
      unit: 'g',
    });
    expect(parseIngredientLine('1 pitada de noz-moscada')).toEqual({
      name: 'Noz-moscada',
      quantity: 1,
      unit: 'pinch',
    });
  });

  it('converts imperial units to metric', () => {
    expect(parseIngredientLine('1 lb beef')).toEqual({
      name: 'Beef',
      quantity: 454,
      unit: 'g',
    });
    expect(parseIngredientLine('8 oz cheese')).toEqual({
      name: 'Cheese',
      quantity: 227,
      unit: 'g',
    });
    expect(parseIngredientLine('1 cup milk')).toEqual({
      name: 'Milk',
      quantity: 240,
      unit: 'ml',
    });
    expect(parseIngredientLine('3 dl cream')).toEqual({
      name: 'Cream',
      quantity: 300,
      unit: 'ml',
    });
    expect(parseIngredientLine('500 mg yeast')).toEqual({
      name: 'Yeast',
      quantity: 0.5,
      unit: 'g',
    });
  });

  it('counts things when there is no unit', () => {
    expect(parseIngredientLine('2 eggs')).toEqual({
      name: 'Eggs',
      quantity: 2,
      unit: 'unit',
    });
    expect(parseIngredientLine('3 cloves garlic')).toEqual({
      name: 'Cloves garlic',
      quantity: 3,
      unit: 'unit',
    });
  });

  it('does not take a unit from the start of a word', () => {
    expect(parseIngredientLine('3 garlic cloves')).toEqual({
      name: 'Garlic cloves',
      quantity: 3,
      unit: 'unit',
    });
    expect(parseIngredientLine('2 limes')).toEqual({
      name: 'Limes',
      quantity: 2,
      unit: 'unit',
    });
  });

  it('leaves names alone when a number is part of them', () => {
    expect(parseIngredientLine('7up')).toEqual({
      name: '7up',
      quantity: null,
      unit: 'unit',
    });
    expect(parseIngredientLine('2% milk')).toEqual({
      name: '2% milk',
      quantity: null,
      unit: 'unit',
    });
  });

  it('treats a bare name and "to taste" as no quantity', () => {
    expect(parseIngredientLine('salt')).toEqual({
      name: 'Salt',
      quantity: null,
      unit: 'unit',
    });
    expect(parseIngredientLine('salt to taste')).toEqual({
      name: 'Salt',
      quantity: null,
      unit: 'unit',
    });
    expect(parseIngredientLine('sal q.b.')).toEqual({
      name: 'Sal',
      quantity: null,
      unit: 'unit',
    });
    expect(parseIngredientLine('pimenta a gosto')).toEqual({
      name: 'Pimenta',
      quantity: null,
      unit: 'unit',
    });
  });

  it('strips a list bullet', () => {
    expect(parseIngredientLine('- 400 g spaghetti')).toEqual({
      name: 'Spaghetti',
      quantity: 400,
      unit: 'g',
    });
    expect(parseIngredientLine('* 2 eggs')).toEqual({
      name: 'Eggs',
      quantity: 2,
      unit: 'unit',
    });
  });

  it('does not strip "de" from the start of a word', () => {
    expect(parseIngredientLine('1 dessert apple').name).toBe('Dessert apple');
    expect(parseIngredientLine('desserts').name).toBe('Desserts');
  });

  it('returns an empty name for empty input', () => {
    expect(parseIngredientLine('   ').name).toBe('');
  });
});

describe('formatAmount', () => {
  it('shows numbers plainly and units after them', () => {
    expect(formatAmount(400, 'g')).toBe('400 g');
    expect(formatAmount(2, 'tbsp')).toBe('2 tbsp');
    expect(formatAmount(2, 'unit')).toBe('2');
    expect(formatAmount(null, 'unit')).toBe('');
  });

  it('switches large weights and volumes to kg and l', () => {
    expect(formatAmount(1500, 'g')).toBe('1.5 kg');
    expect(formatAmount(1000, 'ml')).toBe('1 l');
    expect(formatAmount(999, 'g')).toBe('999 g');
  });

  it('uses the given decimal separator and trims long decimals', () => {
    expect(formatAmount(1.5, 'kg', ',')).toBe('1,5 kg');
    expect(formatAmount(0.3333, 'tsp')).toBe('0.33 tsp');
  });
});

describe('formatIngredient', () => {
  it('puts the amount before the name, and nothing before a to-taste name', () => {
    expect(formatIngredient({ name: 'Spaghetti', quantity: 400, unit: 'g' })).toBe(
      '400 g Spaghetti',
    );
    expect(formatIngredient({ name: 'Eggs', quantity: 2, unit: 'unit' })).toBe('2 Eggs');
    expect(formatIngredient({ name: 'Salt', quantity: null, unit: 'unit' })).toBe('Salt');
  });

  it('round-trips through the parser', () => {
    const line = formatIngredient({
      name: 'Spaghetti',
      quantity: 400,
      unit: 'g',
    });
    expect(parseIngredientLine(line)).toEqual({
      name: 'Spaghetti',
      quantity: 400,
      unit: 'g',
    });
  });
});

describe('isLikelyStaple', () => {
  it('knows common staples in English and Portuguese', () => {
    for (const name of ['Salt', 'olive oil', 'Azeite', 'Açúcar', 'Farinha', 'Water', 'Água']) {
      expect(isLikelyStaple(name), name).toBe(true);
    }
  });

  it('ignores descriptive words', () => {
    for (const name of [
      'Extra virgin olive oil',
      'Sea salt',
      'Black pepper',
      'Azeite extra virgem',
      'Sal grosso',
      'Folha de louro',
    ]) {
      expect(isLikelyStaple(name), name).toBe(true);
    }
  });

  it('does not flag what has to be bought fresh', () => {
    for (const name of [
      'Spaghetti',
      'Salmon',
      'Salted butter',
      'Bacalhau salgado',
      'Pepper steak',
      'Eggs',
    ]) {
      expect(isLikelyStaple(name), name).toBe(false);
    }
  });
});

describe('ingredientFromLine', () => {
  it('parses the line and sets the staple flag from the name', () => {
    expect(ingredientFromLine('a', '1 tsp salt')).toEqual({
      id: 'a',
      name: 'Salt',
      quantity: 1,
      unit: 'tsp',
      staple: true,
    });
    expect(ingredientFromLine('b', '400 g spaghetti')).toEqual({
      id: 'b',
      name: 'Spaghetti',
      quantity: 400,
      unit: 'g',
      staple: false,
    });
  });

  it('returns null for an empty line', () => {
    expect(ingredientFromLine('c', '  ')).toBeNull();
  });
});
