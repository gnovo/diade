/**
 * Recipes and their ingredients. Quantities are metric and numeric, so ingredients from
 * different recipes can later be added together. Nothing here depends on the UI language
 * except the alias tables, which read both English and Portuguese.
 */

/** Metric weights and volumes, spoons, a pinch, and `unit` for things counted (2 eggs). */
export const RECIPE_UNITS = ['g', 'kg', 'ml', 'l', 'tbsp', 'tsp', 'pinch', 'unit'] as const;
export type RecipeUnit = (typeof RECIPE_UNITS)[number];

export interface RecipeIngredient {
  /** Stable within the recipe, so a row keeps its identity while it is edited or reordered. */
  id: string;
  name: string;
  /** Null for "to taste" (salt, a squeeze of lemon). */
  quantity: number | null;
  unit: RecipeUnit;
  /**
   * A pantry staple (salt, olive oil): it lasts for many meals, so a grocery list built from a
   * meal plan leaves it out unless asked.
   */
  staple: boolean;
}

export interface Recipe {
  id: string;
  spaceId: string;
  creatorId: string;
  name: string;
  /** How many people the quantities feed. */
  servings: number;
  notes: string | null;
  ingredients: RecipeIngredient[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export const MIN_SERVINGS = 1;
export const MAX_SERVINGS = 50;
export const DEFAULT_SERVINGS = 4;

// --- Text helpers ---

/** Lowercases, strips diacritics and collapses whitespace, so "Açúcar " matches "acucar". */
export function normalizeIngredientName(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const capitalizeFirst = (text: string): string =>
  text.charAt(0).toLocaleUpperCase() + text.slice(1);

// --- Units ---

interface UnitAlias {
  unit: RecipeUnit;
  /** Multiplies the written quantity to get the metric one (1 lb = 453.6 g). */
  factor: number;
  words: string[];
}

/** Every spelling is lowercase; accents are listed both ways because matching is on the raw text. */
const UNIT_ALIASES: UnitAlias[] = [
  {
    unit: 'kg',
    factor: 1,
    words: ['kg', 'kgs', 'kilo', 'kilos', 'quilo', 'quilos', 'quilograma', 'quilogramas'],
  },
  {
    unit: 'g',
    factor: 1,
    words: ['g', 'gr', 'gram', 'grams', 'grama', 'gramas'],
  },
  { unit: 'g', factor: 0.001, words: ['mg'] },
  {
    unit: 'g',
    factor: 28.35,
    words: ['oz', 'ounce', 'ounces', 'onça', 'onca', 'onças', 'oncas'],
  },
  {
    unit: 'g',
    factor: 453.6,
    words: ['lb', 'lbs', 'pound', 'pounds', 'libra', 'libras'],
  },
  {
    unit: 'l',
    factor: 1,
    words: ['l', 'lt', 'liter', 'liters', 'litre', 'litres', 'litro', 'litros'],
  },
  {
    unit: 'ml',
    factor: 1,
    words: [
      'ml',
      'mililitro',
      'mililitros',
      'milliliter',
      'milliliters',
      'millilitre',
      'millilitres',
    ],
  },
  { unit: 'ml', factor: 10, words: ['cl', 'centilitro', 'centilitros'] },
  { unit: 'ml', factor: 100, words: ['dl', 'decilitro', 'decilitros'] },
  { unit: 'ml', factor: 240, words: ['cup', 'cups'] },
  {
    unit: 'tbsp',
    factor: 1,
    words: [
      'tbsp',
      'tbs',
      'tablespoon',
      'tablespoons',
      'colher de sopa',
      'colheres de sopa',
      'c. de sopa',
      'c. sopa',
    ],
  },
  {
    unit: 'tsp',
    factor: 1,
    words: [
      'tsp',
      'teaspoon',
      'teaspoons',
      'colher de chá',
      'colher de cha',
      'colheres de chá',
      'colheres de cha',
      'c. de chá',
      'c. de cha',
      'c. chá',
      'c. cha',
    ],
  },
  {
    unit: 'pinch',
    factor: 1,
    words: ['pinch', 'pinches', 'pitada', 'pitadas'],
  },
];

/** All spellings, longest first, so "colher de sopa" is tried before "c" could swallow it. */
const UNIT_LOOKUP: Array<{ word: string; alias: UnitAlias }> = UNIT_ALIASES.flatMap((alias) =>
  alias.words.map((word) => ({ word, alias })),
).sort((a, b) => b.word.length - a.word.length);

// --- Numbers ---

const VULGAR: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const NUMBER = String.raw`\d+\s+\d+\/\d+|\d+\s*\/\s*\d+|\d+[.,]\d+|\d+[¼½¾]?|[¼½¾]`;
const LEADING_NUMBER = new RegExp(`^(${NUMBER})`);

/** "1/2", "1 1/2", "1½", "1,5", "½", "400" to a number; null when it is not one. */
export function parseQuantityNumber(text: string): number | null {
  const value = text.trim();
  if (value in VULGAR) return VULGAR[value];
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(value);
  if (mixed)
    return Number(mixed[3]) === 0 ? null : Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(value);
  if (fraction) return Number(fraction[2]) === 0 ? null : Number(fraction[1]) / Number(fraction[2]);
  const withVulgar = /^(\d+)([¼½¾])$/.exec(value);
  if (withVulgar) return Number(withVulgar[1]) + VULGAR[withVulgar[2]];
  const plain = /^\d+(?:[.,]\d+)?$/.exec(value);
  return plain ? Number(value.replace(',', '.')) : null;
}

/** Metric amounts do not need fractions of a gram; spoons and counts keep up to two decimals. */
function round(quantity: number, unit: RecipeUnit): number {
  if (unit === 'g' || unit === 'ml')
    return quantity >= 10 ? Math.round(quantity) : Math.round(quantity * 10) / 10;
  return Math.round(quantity * 100) / 100;
}

// --- Parsing a line ---

export interface ParsedIngredient {
  name: string;
  quantity: number | null;
  unit: RecipeUnit;
}

const TO_TASTE = /\s*(?:,|-|–)?\s*\b(?:to taste|q\.?\s?b\.?|a gosto|ao gosto)\s*$/i;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;
const CONNECTOR = /^(?:(?:de|do|da|of)\s+|d['’])/i;

const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

interface UnitMatch {
  alias: UnitAlias;
  /** The matched spelling from the table (lowercase). */
  word: string;
  /** What follows the unit, with a leading "of" / "de" removed. Empty for "400 g". */
  name: string;
}

/** Every unit spelling that starts `rest` (the text after the number), longest first. */
function unitMatches(rest: string): UnitMatch[] {
  const afterNumber = rest.toLowerCase().replace(/^\s*/, '');
  const matches: UnitMatch[] = [];
  for (const { word, alias } of UNIT_LOOKUP) {
    if (!afterNumber.startsWith(word)) continue;
    const tail = afterNumber.slice(word.length);
    // The unit must end at a word boundary: "g" must not be the start of "garlic".
    if (/^\p{L}/u.test(tail)) continue;
    const originalTail = rest.slice(rest.length - tail.length).replace(/^\.?\s*/, '');
    matches.push({ alias, word, name: clean(originalTail.replace(CONNECTOR, '')) });
  }
  return matches;
}

/**
 * Reads one ingredient line in English or Portuguese and converts it to metric:
 * "400 g spaghetti", "1 lb beef" (454 g), "2 colheres de sopa de azeite", "1½ tsp salt",
 * "2 eggs", "sal q.b.". A number only counts as a quantity when it stands apart from the name
 * or is glued to a unit ("400g"), so "7up" and "2% milk" stay names.
 */
export function parseIngredientLine(input: string): ParsedIngredient {
  let text = clean(input.replace(BULLET, ''));
  let toTaste = false;
  if (TO_TASTE.test(text)) {
    text = clean(text.replace(TO_TASTE, ''));
    toTaste = true;
  }

  const asName = (value: string): ParsedIngredient => ({
    name: capitalizeFirst(clean(value.replace(CONNECTOR, ''))),
    quantity: null,
    unit: 'unit',
  });

  const numberMatch = LEADING_NUMBER.exec(text);
  const quantity = numberMatch ? parseQuantityNumber(numberMatch[1]) : null;
  if (!numberMatch || quantity === null) return asName(text);

  const rest = text.slice(numberMatch[0].length);
  // "2 x eggs", "3× tomatoes": a count, whatever the name starts with ("2 x Cup noodles").
  const times = /^\s*[x×]\s+(?!\d)(\S.*)$/i.exec(rest);
  if (times) {
    return {
      name: capitalizeFirst(clean(times[1])),
      quantity: toTaste ? null : round(quantity, 'unit'),
      unit: 'unit',
    };
  }
  const withUnit = unitMatches(rest).find((match) => match.name);
  if (withUnit) {
    return {
      name: capitalizeFirst(withUnit.name),
      quantity: round(quantity * withUnit.alias.factor, withUnit.alias.unit),
      unit: withUnit.alias.unit,
    };
  }

  // No unit: the number counts things ("2 eggs"), and must stand apart from the name.
  if (!/^\s/.test(rest)) return asName(text);
  const name = clean(rest.replace(CONNECTOR, ''));
  if (!name) return asName(text);
  return {
    name: capitalizeFirst(name),
    quantity: toTaste ? null : round(quantity, 'unit'),
    unit: 'unit',
  };
}

// --- How sure the parser is ---

/**
 * Why a line should be looked at before it is trusted. `parseIngredientLine` always returns
 * something; this says when that something is a guess.
 * - `looseMeasure`: counted in a non-metric measure ("1 knob butter", "1 lata de atum"), so the
 *   quantity does not mean what it says.
 * - `unknownUnit`: a token after the number that looks like a unit the table does not know
 *   ("2 pcs chicken", "1 jar of pesto").
 * - `noName`: a quantity with nothing to count ("400 g", "2").
 * - `outOfRange`: a quantity that cannot be stored (zero, or beyond 100000).
 * - `similarName`: one typo away from a name used more often ("meet" for "meat"). Set when importing, where
 *   the names already in use are known; `assessIngredientLine` itself never returns it.
 */
export type IngredientFlag =
  | 'looseMeasure'
  | 'unknownUnit'
  | 'noName'
  | 'outOfRange'
  | 'similarName';

export interface AssessedIngredient {
  ingredient: ParsedIngredient;
  flag: IngredientFlag | null;
  /** The amount as written when it was converted to metric ("1 lb"), else null. */
  convertedFrom: string | null;
}

/** Measure words that are not metric. Singular and plural, English and Portuguese. */
const LOOSE_MEASURES = new Set([
  'knob',
  'knobs',
  'handful',
  'handfuls',
  'bunch',
  'bunches',
  'dash',
  'dashes',
  'splash',
  'splashes',
  'can',
  'cans',
  'tin',
  'tins',
  'slice',
  'slices',
  'packet',
  'packets',
  'clove',
  'cloves',
  'sprig',
  'sprigs',
  'stick',
  'sticks',
  'molho',
  'molhos',
  'lata',
  'latas',
  'fatia',
  'fatias',
  'ramo',
  'ramos',
  'punhado',
  'punhados',
  'dente',
  'dentes',
  'pacote',
  'pacotes',
  'raminho',
  'raminhos',
  'fio',
  'fios',
]);

/** Abbreviations that read as a unit but are not in the table. */
const UNIT_ABBREVIATIONS = new Set(['pcs', 'pc', 'pkt', 'pkg', 'pk', 'ct', 'cs', 'cc']);

const MAX_QUANTITY = 100000;

/** `parseIngredientLine`, plus a signal for the lines it can only guess at. */
export function assessIngredientLine(input: string): AssessedIngredient {
  const ingredient = parseIngredientLine(input);
  const result = (flag: IngredientFlag | null, convertedFrom: string | null = null) => ({
    ingredient,
    flag,
    convertedFrom,
  });
  if (!ingredient.name) return result('noName');

  let text = clean(input.replace(BULLET, ''));
  text = clean(text.replace(TO_TASTE, ''));
  const numberMatch = LEADING_NUMBER.exec(text);
  const quantity = numberMatch ? parseQuantityNumber(numberMatch[1]) : null;
  // No number: a name, with "to taste" as its amount. Nothing to doubt.
  if (!numberMatch || quantity === null) return result(null);

  const outOfRange =
    ingredient.quantity !== null &&
    (ingredient.quantity <= 0 || ingredient.quantity > MAX_QUANTITY);
  const rest = text.slice(numberMatch[0].length);
  const afterNumber = rest.trimStart();

  const units = unitMatches(rest);
  if (units.length > 0) {
    const named = units.find((match) => match.name);
    if (!named) return result('noName');
    if (outOfRange) return result('outOfRange');
    const written = afterNumber.slice(0, named.word.length);
    return result(null, named.alias.factor === 1 ? null : `${numberMatch[0]} ${written}`);
  }

  if (!afterNumber) return result('noName');
  // "7up", "2%": the number is part of the name.
  if (!/^\s/.test(rest)) return result(null);
  if (outOfRange) return result('outOfRange');

  const [first = '', second = ''] = afterNumber.split(/\s+/);
  const word = first.toLowerCase().replace(/[.,;:]+$/, '');
  if (LOOSE_MEASURES.has(word)) return result('looseMeasure');
  const abbreviated = first.endsWith('.') || UNIT_ABBREVIATIONS.has(word);
  // "2 jars of pesto": a word standing between the number and "of" is a measure.
  const measuring = /^(?:de|do|da|dos|das|of)$/i.test(second);
  return result(abbreviated || measuring ? 'unknownUnit' : null);
}

// --- Showing a quantity ---

/** 1.5 → "1.5", 2 → "2", 0.333 → "0.33". `decimal` is "," for Portuguese. */
function formatNumber(value: number, decimal: string): string {
  const text = String(Math.round(value * 100) / 100);
  return decimal === '.' ? text : text.replace('.', decimal);
}

/**
 * "400 g", "1.5 kg", "2 tbsp", "2" (counted), "" (to taste). Large weights and volumes are shown in
 * kilograms and litres: 1500 g reads as "1.5 kg".
 */
export function formatAmount(quantity: number | null, unit: RecipeUnit, decimal = '.'): string {
  if (quantity === null) return '';
  if (unit === 'g' && quantity >= 1000) return `${formatNumber(quantity / 1000, decimal)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${formatNumber(quantity / 1000, decimal)} l`;
  if (unit === 'unit') return formatNumber(quantity, decimal);
  return `${formatNumber(quantity, decimal)} ${unit}`;
}

/** "400 g Spaghetti": the text a member would type to get this ingredient back. */
export function formatIngredient(
  ingredient: Pick<RecipeIngredient, 'name' | 'quantity' | 'unit'>,
  decimal = '.',
): string {
  const amount = formatAmount(ingredient.quantity, ingredient.unit, decimal);
  return amount ? `${amount} ${ingredient.name}` : ingredient.name;
}

// --- Pantry staples ---

/** Words that describe a staple without changing what it is ("extra virgin olive oil"). */
const STAPLE_MODIFIERS = new Set([
  'extra',
  'virgin',
  'virgem',
  'fine',
  'fino',
  'fina',
  'coarse',
  'grosso',
  'ground',
  'moido',
  'moida',
  'black',
  'preta',
  'preto',
  'white',
  'branca',
  'branco',
  'sea',
  'marinho',
  'kosher',
  'de',
  'of',
  'the',
  'folha',
  'folhas',
  'leaf',
  'leaves',
  'dried',
  'seco',
  'seca',
]);

const STAPLES = new Set([
  // English
  'salt',
  'pepper',
  'olive oil',
  'oil',
  'vegetable oil',
  'sunflower oil',
  'vinegar',
  'sugar',
  'flour',
  'water',
  'paprika',
  'cumin',
  'oregano',
  'cinnamon',
  'bay',
  'thyme',
  'baking powder',
  'baking soda',
  'soy sauce',
  'stock cube',
  // Portuguese
  'sal',
  'pimenta',
  'azeite',
  'oleo',
  'oleo vegetal',
  'oleo girassol',
  'vinagre',
  'acucar',
  'farinha',
  'agua',
  'colorau',
  'cominhos',
  'oregaos',
  'canela',
  'louro',
  'tomilho',
  'fermento',
  'bicarbonato sodio',
  'molho soja',
  'cubo caldo',
]);

/**
 * Whether an ingredient is probably a pantry staple. A starting point only: the member can flip it
 * per ingredient, and what they choose is what gets stored.
 */
export function isLikelyStaple(name: string): boolean {
  const words = normalizeIngredientName(name)
    .split(/[\s,()]+/)
    .filter((word) => word && !STAPLE_MODIFIERS.has(word));
  return STAPLES.has(words.join(' '));
}

// --- Building ingredients ---

/** Turns a typed line into an ingredient, deciding the staple flag from the name. */
export function ingredientFromLine(id: string, line: string): RecipeIngredient | null {
  const parsed = parseIngredientLine(line);
  if (!parsed.name) return null;
  return { id, ...parsed, staple: isLikelyStaple(parsed.name) };
}
