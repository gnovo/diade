import { describe, expect, it } from 'vitest';
import {
  cleanStep,
  formatRecipeNotes,
  normalizeRecipeNotes,
  parseRecipeNotes,
  sectionKind,
} from './recipeSections';

const sections = (over: Partial<ReturnType<typeof parseRecipeNotes>> = {}) => ({
  steps: [],
  notes: '',
  source: '',
  ...over,
});

describe('sectionKind', () => {
  it('reads English and Portuguese titles, ignoring case, accents and a colon', () => {
    expect(sectionKind('Steps')).toBe('steps');
    expect(sectionKind('Preparação')).toBe('steps');
    expect(sectionKind('Modo de preparo:')).toBe('steps');
    expect(sectionKind('Notas')).toBe('notes');
    expect(sectionKind('Fonte')).toBe('source');
    expect(sectionKind('Ingredients')).toBeNull();
    expect(sectionKind('Tips')).toBeNull();
  });
});

describe('parseRecipeNotes', () => {
  it('reads old free text as notes', () => {
    expect(parseRecipeNotes('Serve cold.\nGood with bread.')).toEqual(
      sections({ notes: 'Serve cold.\nGood with bread.' }),
    );
    expect(parseRecipeNotes(null)).toEqual(sections());
    expect(parseRecipeNotes('')).toEqual(sections());
  });

  it('reads the three sections and strips list markers from steps', () => {
    const text =
      '## Steps\n1. Boil.\n2) Fry.\n- Mix.\n\n## Notes\nServe hot.\n\n## Source\nhttps://x.test';
    expect(parseRecipeNotes(text)).toEqual({
      steps: ['Boil.', 'Fry.', 'Mix.'],
      notes: 'Serve hot.',
      source: 'https://x.test',
    });
  });

  it('keeps text before the first heading, and other headings, as notes', () => {
    expect(parseRecipeNotes('Intro.\n\n## Variations\nAdd chilli.\n\n## Steps\n1. Cook.')).toEqual(
      sections({ steps: ['Cook.'], notes: 'Intro.\n\n## Variations\nAdd chilli.' }),
    );
  });

  it('joins a repeated section with a blank line', () => {
    expect(parseRecipeNotes('Intro.\n## Notes\nMore.').notes).toBe('Intro.\n\nMore.');
  });

  it('reads Portuguese headings', () => {
    expect(parseRecipeNotes('## Preparação\n1. Coza.\n\n## Notas\nServir quente.')).toEqual(
      sections({ steps: ['Coza.'], notes: 'Servir quente.' }),
    );
  });
});

describe('formatRecipeNotes', () => {
  it('writes only the sections that have something', () => {
    expect(formatRecipeNotes(sections())).toBeNull();
    expect(formatRecipeNotes(sections({ notes: ' Serve cold. ' }))).toBe('## Notes\nServe cold.');
    expect(formatRecipeNotes(sections({ steps: ['Boil.', ' ', 'Fry.'], source: 'Mum' }))).toBe(
      '## Steps\n1. Boil.\n2. Fry.\n\n## Source\nMum',
    );
  });

  it('writes a step as one paragraph', () => {
    expect(cleanStep('Boil\n  for ten minutes')).toBe('Boil for ten minutes');
    expect(formatRecipeNotes(sections({ steps: ['Boil\nfor ten'] }))).toBe(
      '## Steps\n1. Boil for ten',
    );
  });
});

describe('round trip', () => {
  const cases = [
    sections({
      steps: ['Boil the pasta.', 'Fry the guanciale.'],
      notes: 'Serve hot.',
      source: 'https://x.test/r',
    }),
    sections({ notes: 'Just a note.' }),
    sections({ steps: ['3. A step that looks numbered.'] }),
    // Free text that would read as a heading survives, however many backslashes it already has.
    sections({ notes: 'Before\n## Steps\n\\## Notes\nAfter' }),
    sections({ source: 'Line one\n## Source\nLine three' }),
    sections({ notes: 'Other heading\n## Variations\nstays' }),
  ];
  it.each(cases)('parse(format(x)) is x', (original) => {
    expect(parseRecipeNotes(formatRecipeNotes(original))).toEqual(original);
  });

  it('is stable: normalising twice changes nothing, and old text gains its heading', () => {
    const once = normalizeRecipeNotes('Serve cold.');
    expect(once).toBe('## Notes\nServe cold.');
    expect(normalizeRecipeNotes(once)).toBe(once);
  });
});
