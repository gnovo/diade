import { describe, expect, it } from 'vitest';
import { formatQuantity, parseQuantity } from './parseQuantity';

describe('parseQuantity', () => {
  it('reads a leading count', () => {
    expect(parseQuantity('2 milk')).toEqual({ name: 'milk', quantity: '2', unit: null });
    expect(parseQuantity('2x milk')).toEqual({ name: 'milk', quantity: '2', unit: null });
    expect(parseQuantity('3 x oat milk')).toEqual({ name: 'oat milk', quantity: '3', unit: null });
  });

  it('reads a trailing count', () => {
    expect(parseQuantity('milk x2')).toEqual({ name: 'milk', quantity: '2', unit: null });
    expect(parseQuantity('milk x 2')).toEqual({ name: 'milk', quantity: '2', unit: null });
    expect(parseQuantity('milk 2')).toEqual({ name: 'milk', quantity: '2', unit: null });
  });

  it('reads weights and volumes', () => {
    expect(parseQuantity('500g flour')).toEqual({ name: 'flour', quantity: '500', unit: 'g' });
    expect(parseQuantity('2 kg rice')).toEqual({ name: 'rice', quantity: '2', unit: 'kg' });
    expect(parseQuantity('1,5L water')).toEqual({ name: 'water', quantity: '1.5', unit: 'l' });
  });

  it('leaves names that merely contain digits alone', () => {
    expect(parseQuantity('7up')).toEqual({ name: '7up', quantity: null, unit: null });
    expect(parseQuantity('2% milk')).toEqual({ name: '2% milk', quantity: null, unit: null });
    expect(parseQuantity('vitamin B12')).toEqual({
      name: 'vitamin B12',
      quantity: null,
      unit: null,
    });
  });

  it('keeps a bare number as the name', () => {
    expect(parseQuantity('2')).toEqual({ name: '2', quantity: null, unit: null });
  });

  it('trims and collapses whitespace', () => {
    expect(parseQuantity('  2   milk  ')).toEqual({ name: 'milk', quantity: '2', unit: null });
    expect(parseQuantity('   ')).toEqual({ name: '', quantity: null, unit: null });
  });
});

describe('formatQuantity', () => {
  it('joins quantity and unit', () => {
    expect(formatQuantity('500', 'g')).toBe('500 g');
    expect(formatQuantity('2', null)).toBe('2');
    expect(formatQuantity(null, 'g')).toBeNull();
  });
});
