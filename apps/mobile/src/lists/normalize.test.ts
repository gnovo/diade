import { describe, it, expect } from 'vitest';
import { capitalizeFirst, normalizeText } from './normalize';

describe('normalizeText', () => {
  it('lowercases, strips accents and collapses whitespace', () => {
    expect(normalizeText('  Açúcar   Mascavado ')).toBe('acucar mascavado');
  });
});

describe('capitalizeFirst', () => {
  it('capitalizes only the first letter', () => {
    expect(capitalizeFirst('queijo fresco')).toBe('Queijo fresco');
    expect(capitalizeFirst('  ovos de Codorniz')).toBe('Ovos de Codorniz');
    expect(capitalizeFirst('éclair')).toBe('Éclair');
    expect(capitalizeFirst('')).toBe('');
  });
});
