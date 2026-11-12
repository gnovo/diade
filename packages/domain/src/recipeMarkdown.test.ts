import { describe, expect, it } from 'vitest';
import {
  type DraftRecipe,
  draftToRecipeInput,
  flagSimilarNames,
  formatRecipeMarkdown,
  parseRecipesMarkdown,
  type RecipeInput,
} from './recipeMarkdown';
import { normalizeRecipeNotes } from './recipeSections';

const files = import.meta.glob('./__fixtures__/recipes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const fixture = (name: string): string => {
  const text = files[`./__fixtures__/recipes/${name}.md`];
  if (text === undefined) throw new Error(`missing fixture ${name}`);
  return text;
};

const read = (name: string): DraftRecipe[] => {
  let n = 0;
  return parseRecipesMarkdown(fixture(name), () => `id${++n}`);
};

/** Ingredient lines as "quantity unit name" for compact assertions. */
const summary = (draft: DraftRecipe) =>
  draft.lines.map(
    (l) => `${l.ingredient.quantity ?? '-'} ${l.ingredient.unit} ${l.ingredient.name}`,
  );

describe('parseRecipesMarkdown fixtures', () => {
  it('reads an English recipe: servings, converted amounts, steps kept as notes', () => {
    const [recipe, ...more] = read('english-single');
    expect(more).toHaveLength(0);
    expect(recipe.name).toBe('Spaghetti carbonara');
    expect(recipe.servings).toBe(4);
    expect(summary(recipe)).toEqual([
      '400 g Spaghetti',
      '200 g Guanciale',
      '4 unit Eggs',
      '1 tsp Salt',
      '120 ml Grated pecorino',
      '454 g Beef mince',
      '- unit Black pepper',
    ]);
    expect(recipe.lines[4].convertedFrom).toBe('1/2 cup');
    expect(recipe.lines[5].convertedFrom).toBe('1 lb');
    expect(recipe.lines[3].ingredient.staple).toBe(true);
    expect(recipe.lines.every((l) => l.flag === null)).toBe(true);
    // The description and the steps survive, the tag line does not.
    expect(recipe.notes).toContain('A Roman classic.');
    expect(recipe.notes).toContain('## Steps');
    expect(recipe.notes).toContain('3. Toss everything off the heat.');
    expect(recipe.notes).not.toContain('tags:');
    expect(recipe.warnings).toEqual([]);
  });

  it('reads a Portuguese recipe (doses, Ingredientes, de, q.b., dl)', () => {
    const [recipe] = read('portuguese-single');
    expect(recipe.name).toBe('Bacalhau com natas');
    expect(recipe.servings).toBe(6);
    expect(summary(recipe)).toEqual([
      '800 g Bacalhau demolhado',
      '2 tbsp Azeite',
      '1 kg Batata',
      '2 unit Cebolas',
      '3 unit Dentes de alho',
      '200 ml Natas',
      '1 unit Lata de atum',
      '- unit Sal',
      '150 ml Leite',
    ]);
    expect(recipe.lines.filter((l) => l.flag).map((l) => l.flag)).toEqual([
      'looseMeasure',
      'looseMeasure',
    ]);
    expect(recipe.notes).toContain('## Steps');
    expect(recipe.notes).toContain('1. Coza as batatas.');
  });

  it('strips every bullet style, checkboxes, emphasis and wiki links', () => {
    const [recipe] = read('mixed-bullets');
    expect(recipe.servings).toBe(4);
    expect(summary(recipe)).toEqual([
      '500 g Chicken thigh',
      '1 tbsp Curry powder',
      '400 ml Coconut milk',
      '1 unit Onion',
      '2 unit Cloves garlic',
      '1 unit Knob ginger',
      '1 tsp Salt',
      '200 g Rice',
      '2 unit Tomatoes',
      '- unit Mango chutney',
    ]);
    expect(recipe.notes).toBeNull();
  });

  it('splits a file with many recipes, drops the introduction, keeps empty ones with a warning', () => {
    const recipes = read('many-recipes');
    expect(recipes.map((r) => r.name)).toEqual([
      'Lentil soup',
      'Pão de forma',
      'Just a title with nothing under it',
      'Garlic bread',
    ]);
    expect(recipes.map((r) => r.servings)).toEqual([2, 8, 4, 4]);
    expect(recipes[0].notes).toBe('## Steps\n1. Simmer for twenty minutes.');
    expect(recipes[2].warnings).toEqual(['noIngredients']);
    // The explicit Notes heading is not repeated inside the notes.
    expect(recipes[3].notes).toBe('## Notes\nBake at 200 C.');
    expect(recipes[1].lines.map((l) => l.flag)).toEqual([
      null,
      'unknownUnit',
      null,
      null,
      'unknownUnit',
    ]);
    expect(recipes[3].lines.map((l) => l.flag)).toEqual([null, 'looseMeasure', null]);
  });

  it('copes with missing sections', () => {
    const [toast, eggs] = read('missing-sections');
    expect(toast.name).toBe('Quick toast');
    expect(toast.lines).toEqual([]);
    expect(toast.warnings).toEqual(['noIngredients']);
    expect(toast.notes).toBe('## Notes\nToast the bread. Add butter. Done.');
    expect(eggs.servings).toBe(2);
    expect(summary(eggs)).toEqual(['2 unit Eggs', '2 unit Slices bread']);
    expect(eggs.lines[1].flag).toBe('looseMeasure');
    expect(eggs.notes).toBe('## Notes\n## Tips\nUse good bread.');
  });

  it('flags the lines the parser can only guess at', () => {
    const [recipe] = read('flagged-lines');
    const flags = Object.fromEntries(recipe.lines.map((l) => [l.raw, l.flag]));
    expect(flags).toEqual({
      '1 knob butter': 'looseMeasure',
      '1 handful spinach': 'looseMeasure',
      '2 latas de tomate': 'looseMeasure',
      '3 fatias de fiambre': 'looseMeasure',
      '400 g': 'noName',
      '2': 'noName',
      '½ cup': 'noName',
      '2 pcs chicken breast': 'unknownUnit',
      '1 jar of pesto': 'unknownUnit',
      '0 eggs': 'outOfRange',
      '7up': null,
      '2% milk': null,
      sal: null,
    });
  });

  it('leaves unusable lines out of the recipe that would be saved', () => {
    const [recipe] = read('flagged-lines');
    const names = draftToRecipeInput(recipe).ingredients.map((i) => i.name);
    expect(names).toContain('Knob butter');
    expect(names).not.toContain('G');
    expect(names).not.toContain('Eggs');
    expect(names).toHaveLength(recipe.lines.length - 4);
  });

  it('names a note with no heading from its front matter and takes its servings', () => {
    const [recipe, ...more] = read('obsidian-no-heading');
    expect(more).toHaveLength(0);
    expect(recipe.name).toBe('Weeknight bolognese');
    expect(recipe.servings).toBe(5);
    expect(summary(recipe)).toEqual(['500 g Beef mince', '400 g Tomatoes']);
    expect(recipe.notes).toBe('## Steps\n1. Brown the mince.');
    expect(recipe.warnings).toEqual([]);
  });

  it('asks for a name when there is no heading and no title', () => {
    const [recipe] = parseRecipesMarkdown('Ingredients:\n- 2 eggs\n', () => 'x');
    expect(recipe.name).toBe('');
    expect(recipe.warnings).toEqual(['missingName']);
  });

  it('ignores a # line inside a code fence, and treats a group label as a label', () => {
    const recipes = read('fenced-code');
    expect(recipes).toHaveLength(1);
    expect(summary(recipes[0])).toEqual(['200 g Flour', '2 unit Eggs']);
    expect(recipes[0].notes).toContain('# not a recipe');
  });

  it('never throws, and returns nothing for text with no recipe in it', () => {
    for (const text of [
      '',
      '   \n\n',
      'just a sentence',
      '# ',
      '## Ingredients',
      '﻿# X\r\n## Ingredients\r\n- 2 eggs\r\n',
    ]) {
      expect(() => parseRecipesMarkdown(text, () => 'x')).not.toThrow();
    }
    expect(parseRecipesMarkdown('just a sentence', () => 'x')).toEqual([]);
    expect(
      parseRecipesMarkdown('﻿# X\r\n## Ingredients\r\n- 2 eggs\r\n', () => 'x')[0].lines,
    ).toHaveLength(1);
  });

  it('clamps servings and truncates what the schema would refuse', () => {
    const [big] = parseRecipesMarkdown('# A\nservings: 400\n## Ingredients\n- 1 egg', () => 'x');
    expect(big.servings).toBe(50);
    const [odd] = parseRecipesMarkdown('# A\nservings: 4-6\n', () => 'x');
    expect(odd.servings).toBe(4);
    const long = `# A\n## Ingredients\n${Array.from({ length: 120 }, (_, i) => `- ${i + 1} g x${i}`).join('\n')}\n`;
    let n = 0;
    const [many] = parseRecipesMarkdown(long, () => `i${++n}`);
    expect(many.lines).toHaveLength(100);
    expect(many.warnings).toContain('ingredientsTruncated');
  });
});

describe('formatRecipeMarkdown round trip', () => {
  const roundTrip = (recipe: RecipeInput) => {
    const [draft, ...more] = parseRecipesMarkdown(formatRecipeMarkdown(recipe), () => 'x');
    expect(more).toHaveLength(0);
    const input = draftToRecipeInput(draft);
    return {
      ...input,
      ingredients: input.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
    };
  };
  // Notes come back in the current sectioned form: old free text gains its "## Notes" heading.
  const plain = (recipe: RecipeInput) => ({
    ...recipe,
    notes: normalizeRecipeNotes(recipe.notes),
    ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
  });
  const row = (
    name: string,
    quantity: number | null,
    unit: RecipeInput['ingredients'][0]['unit'],
    staple = false,
  ) => ({ id: name, name, quantity, unit, staple });

  it('gives back what was exported', () => {
    const recipe: RecipeInput = {
      name: 'Spaghetti carbonara',
      servings: 4,
      notes: 'Never add cream.\n\n1. Boil.\n2. Toss.',
      ingredients: [
        row('Spaghetti', 400, 'g'),
        row('Guanciale', 1500, 'g'),
        row('Flour', 1.5, 'kg'),
        row('Milk', 2, 'l'),
        row('Water', 250, 'ml'),
        row('Eggs', 4, 'unit'),
        row('Lemons', 0.5, 'unit'),
        row('Olive oil', 2, 'tbsp'),
        row('Salt', 1.5, 'tsp'),
        row('Nutmeg', 1, 'pinch'),
        row('Pepper', null, 'unit'),
        row('Azeite', null, 'unit'),
      ],
    };
    expect(roundTrip(recipe)).toEqual(plain(recipe));
  });

  it('round-trips a recipe without notes or ingredients', () => {
    const recipe: RecipeInput = { name: 'Toast', servings: 1, notes: null, ingredients: [] };
    const [draft] = parseRecipesMarkdown(formatRecipeMarkdown(recipe), () => 'x');
    expect(draftToRecipeInput(draft)).toEqual(recipe);
  });

  it('round-trips every recipe that parsing a fixture gives', () => {
    for (const name of ['english-single', 'portuguese-single', 'mixed-bullets']) {
      const [draft] = read(name);
      const recipe = draftToRecipeInput(draft);
      expect(roundTrip(recipe)).toEqual(plain(recipe));
    }
  });

  it('writes the pantry flag only where the name alone would not give it back', () => {
    const text = formatRecipeMarkdown({
      name: 'X',
      servings: 2,
      notes: null,
      ingredients: [
        row('Salt', 1, 'tsp', true),
        row('Rice', 200, 'g'),
        row('Salt', 2, 'g'),
        row('Truffle oil', 1, 'tbsp', true),
      ],
    });
    expect(text).toBe(
      '# X\nservings: 2\n\n## Ingredients\n- 1 tsp Salt\n- 200 g Rice\n- 2 g Salt #fresh\n- 1 tbsp Truffle oil #pantry\n',
    );
    const [draft] = parseRecipesMarkdown(text, () => 'x');
    expect(draft.lines.map((l) => l.ingredient.staple)).toEqual([true, false, false, true]);
  });

  it('keeps the pantry flag exactly, including overrides of the built-in list', () => {
    const recipe: RecipeInput = {
      name: 'Flags',
      servings: 4,
      notes: null,
      ingredients: [
        row('Salt', 1, 'tsp', true),
        row('Salt', 1, 'tsp'),
        row('Rice', 1, 'kg', true),
        row('Pepper', null, 'unit', true),
      ],
    };
    const [draft] = parseRecipesMarkdown(formatRecipeMarkdown(recipe), () => 'x');
    expect(draftToRecipeInput(draft).ingredients.map((i) => i.staple)).toEqual([
      true,
      false,
      true,
      true,
    ]);
  });

  it('keeps names that would be misread as an amount or a unit', () => {
    const recipe: RecipeInput = {
      name: 'Tricky',
      servings: 2,
      notes: null,
      ingredients: [
        row('1000 Island dressing', null, 'unit'),
        row('Cup noodles', 2, 'unit'),
        row('Pound cake', 1, 'unit'),
        row('Gram flour', 100, 'g'),
        row('7up', 2, 'unit'),
        row('2% milk', null, 'unit'),
      ],
    };
    expect(roundTrip(recipe)).toEqual(plain(recipe));
  });

  it('keeps notes exactly: headings, labels, fields, blank lines and backslashes', () => {
    const notes = [
      '# A heading of its own',
      '## Ingredients',
      'Steps:',
      'servings: 99',
      'Notes',
      '',
      '',
      '',
      '\\# already escaped',
      '```',
      '# inside a fence',
      '```',
      '1. Boil.',
    ].join('\n');
    const recipe: RecipeInput = {
      name: 'Notes test',
      servings: 3,
      notes,
      ingredients: [row('Eggs', 2, 'unit')],
    };
    const [draft, ...more] = parseRecipesMarkdown(formatRecipeMarkdown(recipe), () => 'x');
    expect(more).toHaveLength(0);
    expect(draft.notes).toBe(`## Notes\n${notes}`);
    expect(draft.servings).toBe(3);
    expect(draft.lines).toHaveLength(1);
  });

  it('round-trips steps, notes and a source as sections', () => {
    const notes =
      '## Steps\n1. Boil.\n2. Toss.\n\n## Notes\nNever add cream.\n\n## Source\nhttps://example.test/carbonara';
    const recipe: RecipeInput = {
      name: 'Spaghetti carbonara',
      servings: 4,
      notes,
      ingredients: [row('Spaghetti', 400, 'g')],
    };
    const text = formatRecipeMarkdown(recipe);
    expect(text).toContain(
      '## Ingredients\n- 400 g Spaghetti\n\n## Steps\n1. Boil.\n2. Toss.\n\n## Notes',
    );
    expect(roundTrip(recipe).notes).toBe(notes);
  });

  it('reads Steps, Notes and Source whatever order or language they come in', () => {
    const [draft] = parseRecipesMarkdown(
      '# Bacalhau\n\n## Ingredientes\n- 800 g bacalhau\n\n## Fonte\nA avó\n\n## Notas\nServir quente.\n\n## Modo de preparo\n1. Coza.',
      () => 'x',
    );
    expect(draft.notes).toBe('## Steps\n1. Coza.\n\n## Notes\nServir quente.\n\n## Source\nA avó');
  });

  it('keeps a recipe name that ends in #', () => {
    const [draft] = parseRecipesMarkdown(
      formatRecipeMarkdown({ name: 'Pasta #5 and C#', servings: 1, notes: null, ingredients: [] }),
      () => 'x',
    );
    expect(draft.name).toBe('Pasta #5 and C#');
  });
});

describe('flagSimilarNames', () => {
  const library = [
    {
      ingredients: ['Meat', 'Onion'].map((name, i) => ({
        id: String(i),
        name,
        quantity: 1,
        unit: 'unit' as const,
        staple: false,
      })),
    },
  ];

  it('flags a typo of a name the library uses, and offers that spelling', () => {
    const drafts = parseRecipesMarkdown(
      '# A\n## Ingredients\n- 1 kg meet\n- 1 onion\n- 2 eggs',
      () => 'x',
    );
    const [flagged] = flagSimilarNames(drafts, library);
    expect(flagged.lines.map((l) => l.flag)).toEqual(['similarName', null, null]);
    expect(flagged.lines[0].suggestion).toBe('Meat');
  });

  it('compares names within one import: the less used spelling is flagged', () => {
    const text =
      '# A\n## Ingredients\n- 1 kg meat\n# B\n## Ingredients\n- 1 kg meat\n# C\n## Ingredients\n- 1 kg meet';
    const drafts = flagSimilarNames(
      parseRecipesMarkdown(text, () => 'x'),
      [],
    );
    expect(drafts.map((d) => d.lines[0].flag)).toEqual([null, null, 'similarName']);
  });

  it('keeps a flag the parser already set, and flags nothing when spellings tie', () => {
    const tie = flagSimilarNames(
      parseRecipesMarkdown(
        '# A\n## Ingredients\n- 1 kg meat\n# B\n## Ingredients\n- 1 kg meet',
        () => 'x',
      ),
      [],
    );
    expect(tie.map((d) => d.lines[0].flag)).toEqual([null, null]);
    const loose = flagSimilarNames(
      parseRecipesMarkdown('# A\n## Ingredients\n- 1 knob meet', () => 'x'),
      library,
    );
    expect(loose[0].lines[0].flag).toBe('looseMeasure');
  });
});

describe('hostile input', () => {
  const started = (text: string) => {
    const t0 = Date.now();
    parseRecipesMarkdown(text, () => 'x');
    return Date.now() - t0;
  };

  it('stays fast on long runs of the characters the patterns repeat on', () => {
    const n = 50000;
    for (const piece of ['[[\\', '[', ' ', ',', '#', '-', '*', '1 ', '\t']) {
      expect(started(`# R\n## Ingredients\n- ${piece.repeat(n)}x`)).toBeLessThan(1500);
      expect(started(`# ${piece.repeat(n)}x`)).toBeLessThan(1500);
    }
    expect(started(`# R\n## Ingredients\n- 1 kg meat${','.repeat(n)}x`)).toBeLessThan(1500);
  });

  it('cuts a line longer than a recipe line can be', () => {
    const [recipe] = parseRecipesMarkdown(
      `# R\n## Ingredients\n- 1 kg ${'a'.repeat(20000)}`,
      () => 'x',
    );
    expect(recipe.lines[0].raw.length).toBeLessThan(5001);
  });
});

describe('per-serving nutrition in markdown', () => {
  it('reads kcal and protein in either language, and needs both', () => {
    const [en] = parseRecipesMarkdown(
      '# Bowl\nservings: 2\nkcal: 520\nprotein: 38 g\n\n## Ingredients\n- 100 g rice\n',
      () => 'x',
    );
    expect(en.nutrition).toEqual({ kcal: 520, protein: 38 });
    const [pt] = parseRecipesMarkdown(
      '# Bowl\ncalorias: 512,5\nproteína: 41\n\n## Ingredientes\n- 100 g arroz\n',
      () => 'x',
    );
    expect(pt.nutrition).toEqual({ kcal: 512.5, protein: 41 });
    const [half] = parseRecipesMarkdown(
      '# Bowl\nkcal: 520\n\n## Ingredients\n- 100 g rice\n',
      () => 'x',
    );
    expect(half.nutrition).toBeNull();
    expect(half.notes).toBeNull();
  });

  it('writes them back so they survive a round trip', () => {
    const text = formatRecipeMarkdown({
      name: 'Bowl',
      servings: 1,
      nutrition: { kcal: 512, protein: 41 },
      notes: null,
      ingredients: [],
    });
    expect(text).toContain('kcal: 512\nprotein: 41\n');
    expect(draftToRecipeInput(parseRecipesMarkdown(text, () => 'x')[0]).nutrition).toEqual({
      kcal: 512,
      protein: 41,
    });
  });
});

describe('recipe type in markdown', () => {
  const read = (text: string) => parseRecipesMarkdown(text, () => 'x')[0];
  it('reads the type in English or Portuguese, accents or not', () => {
    expect(read('# A\ntype: snack\n\n## Ingredients\n- 1 egg\n').type).toBe('snack');
    expect(read('# A\ntipo: Pequeno-almoço\n\n## Ingredientes\n- 1 ovo\n').type).toBe('breakfast');
    expect(read('# A\ntipo: refeicao\n\n## Ingredientes\n- 1 ovo\n').type).toBe('meal');
    expect(read('# A\ntipo: Preparação\n\n## Ingredientes\n- 1 ovo\n').type).toBe('prep');
  });

  it('drops a type it does not know, and keeps it out of the notes', () => {
    const draft = read('# A\ntype: dessert\n\n## Ingredients\n- 1 egg\n');
    expect(draft.type).toBeNull();
    expect(draft.notes).toBeNull();
    expect(draftToRecipeInput(draft)).not.toHaveProperty('type');
  });

  it('writes the type back so it survives a round trip', () => {
    const text = formatRecipeMarkdown({
      name: 'Bowl',
      servings: 1,
      type: 'prep',
      notes: null,
      ingredients: [],
    });
    expect(text).toContain('servings: 1\ntype: prep\n');
    expect(draftToRecipeInput(read(text)).type).toBe('prep');
  });
});
