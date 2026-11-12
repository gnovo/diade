/**
 * Recipes as markdown: reading notes written by hand (Obsidian-style, English or Portuguese, one or
 * many recipes per file) and writing a recipe back out so it survives a round trip.
 *
 * Reading never fails. It returns drafts for a person to review: every ingredient line keeps the
 * text it was read from and says when the parser was guessing (see `assessIngredientLine`).
 */

import { ingredientMatchKey } from './ingredientKeys';
import { type KnownName, knownIngredientNames, similarKnownName } from './ingredientNames';
import {
  formatRecipeNotes,
  levelTwoTitle,
  normalizeRecipeNotes,
  parseRecipeNotes,
  sectionKind,
} from './recipeSections';
import {
  type AssessedIngredient,
  assessIngredientLine,
  DEFAULT_SERVINGS,
  type IngredientFlag,
  isLikelyStaple,
  MAX_SERVINGS,
  normalizeIngredientName,
  type Recipe,
  type RecipeIngredient,
  type RecipeType,
} from './recipes';

const MAX_NAME = 120;
const MAX_NOTES = 5000;
const MAX_INGREDIENTS = 100;
const MAX_LINE = 5000;
/** Per serving: what the API accepts for a recipe's own values. */
const MAX_KCAL = 5000;
const MAX_PROTEIN = 500;

/** Flags that leave nothing usable to import: such a line is skipped unless it is fixed. */
const UNUSABLE: IngredientFlag[] = ['noName', 'outOfRange'];

export interface DraftLine {
  id: string;
  /** The line as written, cleaned of bullets and markup. What the review shows and Fix edits. */
  raw: string;
  ingredient: AssessedIngredient['ingredient'] & { staple: boolean };
  flag: IngredientFlag | null;
  convertedFrom: string | null;
  /** For a `similarName` flag: the spelling already in use. */
  suggestion?: string;
}

export type DraftWarning =
  | 'missingName'
  | 'noIngredients'
  | 'ingredientsTruncated'
  | 'notesTruncated';

export interface DraftRecipe {
  name: string;
  servings: number;
  /** Per-serving `kcal:` and `protein:`, when the note gives both. */
  nutrition: { kcal: number; protein: number } | null;
  /** `type:` (or `tipo:`), when it names one of the recipe types in either language. */
  type: RecipeType | null;
  notes: string | null;
  lines: DraftLine[];
  warnings: DraftWarning[];
}

/** What `createRecipeSchema` takes. */
export type RecipeInput = Pick<
  Recipe,
  'name' | 'servings' | 'notes' | 'ingredients' | 'nutrition'
> & {
  type?: RecipeType | null;
};

// --- Reading ---

const H1 = /^#\s+(.*)$/;
const HEADING = /^(#{2,6})\s+(.*)$/;
const FENCE = /^\s*(?:```|~~~)/;
const BULLET_OR_CHECKBOX = /^\s*(?:(?:[-*+•]|\d+[.)])\s+)?(?:\[[ xX]\]\s*)?/;
const META = /^\s*(servings?|serves|doses?|por[cç][õo]es|por[cç][aã]o|tags?)\s*:\s*(.*)$/i;
/** Per-serving nutrition: `kcal: 520`, `calorias: 520`, `protein: 38 g`, `proteína: 38`. */
const NUTRITION_META = /^\s*(kcal|calories|calorias|protein|proteins|prote[ií]nas?)\s*:\s*(.*)$/i;
/** The recipe type: `type: snack`, `tipo: lanche`. */
const TYPE_META = /^\s*(type|tipo)\s*:\s*(.*)$/i;
/** Every way a type is written, accents removed: English, Portuguese, and the app's own labels. */
const TYPE_WORDS: Record<string, RecipeType> = {
  breakfast: 'breakfast',
  'pequeno-almoco': 'breakfast',
  'pequeno almoco': 'breakfast',
  meal: 'meal',
  refeicao: 'meal',
  snack: 'snack',
  lanche: 'snack',
  prep: 'prep',
  preparacao: 'prep',
  'meal prep': 'prep',
};

const INGREDIENTS_TITLE = /\bingredient(?:e)?s?\b/;
/** A `# ` line inside notes is written `\\# ` so it does not start another recipe. */
const ESCAPED_H1 = /^(\\+)(#\s)/;
const H1_IN_NOTES = /^(\\*)(#\s)/;
/** Labels that open a section without a heading ("Ingredients:", "**Steps**"). */
const LABEL =
  /^\s*(?:\*\*|__)?\s*(ingredient(?:e)?s?|steps?|method|instructions?|directions?|preparation|preparacao|modo de preparo|modo de preparacao|notes?|notas?|tips?|dicas?)\s*:?\s*(?:\*\*|__)?\s*:?\s*$/i;

/** Strips markdown that is not text: links, emphasis, code ticks. */
function plain(text: string): string {
  return (
    text
      // Bounded, so a line of repeated brackets cannot make the match quadratic.
      .replace(/\[\[(?:[^\]|]{0,200}\|)?([^\]]{0,200})\]\]/g, '$1')
      .replace(/\[([^\]]{0,200})\]\([^)]{0,500}\)/g, '$1')
      .replace(/(\*\*|__|~~|`)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const sectionTitle = (text: string): string =>
  normalizeIngredientName(plain(text).replace(/:$/, ''));

/** "Title ##" to "Title": the closing hashes of a heading, only when set apart by a space ("C#" keeps its #). */
function closingHashesRemoved(text: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === '#') end--;
  return end < text.length && end > 0 && text[end - 1] === ' '
    ? text.slice(0, end).trimEnd()
    : text;
}

/** A non-negative number, with a decimal point or comma, or null when the value has none. */
function parseAmount(value: string): number | null {
  const found = /\d+(?:[.,]\d+)?/.exec(value);
  return found ? Number(found[0].replace(',', '.')) : null;
}

function parseServings(value: string): number {
  const found = /\d+/.exec(value);
  const count = found ? Number(found[0]) : 0;
  if (count < 1) return DEFAULT_SERVINGS;
  return Math.min(count, MAX_SERVINGS);
}

/** The pantry flag, written as an Obsidian-style tag after the amount: "- 1 tsp Salt #pantry". */
const STAPLE_TAG = /^#(pantry|fresh)$/i;
/** A name that starts with a digit, written `\1000 Island dressing` so the digit is not read as an amount. */
const ESCAPED_NAME = /^\\(\d.*)$/;

/**
 * Turns what a member wrote (or fixed) into a draft line. A trailing `#pantry` / `#fresh` sets the pantry
 * flag; without one it is worked out from the name.
 */
export function draftLineFromText(id: string, text: string): DraftLine | null {
  const written = plain(text.replace(BULLET_OR_CHECKBOX, ''));
  // `plain` leaves single spaces, so the tag is whatever follows the last " #".
  const hash = written.lastIndexOf(' #');
  const tag = hash >= 0 ? STAPLE_TAG.exec(written.slice(hash + 1).trim()) : null;
  const raw = tag ? written.slice(0, hash).trim() : written;
  if (!raw) return null;
  const escaped = ESCAPED_NAME.exec(raw);
  const { ingredient, flag, convertedFrom } = escaped
    ? {
        ingredient: { name: escaped[1], quantity: null, unit: 'unit' as const },
        flag: null,
        convertedFrom: null,
      }
    : assessIngredientLine(raw);
  const staple = tag ? tag[1].toLowerCase() === 'pantry' : isLikelyStaple(ingredient.name);
  return { id, raw, ingredient: { ...ingredient, staple }, flag, convertedFrom };
}

interface Chunk {
  heading: string | null;
  lines: string[];
}

/** Splits at each top-level heading, ignoring `#` inside code fences. What precedes the first one is its own chunk. */
function splitRecipes(lines: string[]): Chunk[] {
  const chunks: Chunk[] = [{ heading: null, lines: [] }];
  let fenced = false;
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    const heading = fenced ? null : H1.exec(line);
    if (heading) chunks.push({ heading: heading[1], lines: [] });
    else chunks[chunks.length - 1].lines.push(line);
  }
  return chunks;
}

function parseChunk(chunk: Chunk, newId: () => string): DraftRecipe {
  let servings = DEFAULT_SERVINGS;
  let kcal: number | null = null;
  let protein: number | null = null;
  let type: RecipeType | null = null;
  const notes: string[] = [];
  const lines: DraftLine[] = [];
  let section: 'body' | 'ingredients' | 'other' | 'verbatim' = 'body';
  let fenced = false;

  for (const line of chunk.lines) {
    // After a Notes or Source heading everything is text, as written: no ingredients, labels or fields are
    // read. Only a Steps, Notes or Source heading (level 2) ends it, as in the sections of `recipeSections`.
    if (section === 'verbatim') {
      const title = levelTwoTitle(line);
      const kind = title === null ? null : sectionKind(sectionTitle(title));
      if (kind) {
        notes.push(line.trim());
        section = kind === 'steps' ? 'other' : 'verbatim';
      } else {
        notes.push(
          line.replace(ESCAPED_H1, (_, slashes: string, hash: string) => slashes.slice(1) + hash),
        );
      }
      continue;
    }
    if (FENCE.test(line)) fenced = !fenced;
    if (fenced || FENCE.test(line)) {
      notes.push(line);
      continue;
    }

    const heading = HEADING.exec(line);
    const label = heading ? null : LABEL.exec(line);
    if (heading || label) {
      const title = sectionTitle(heading ? heading[2] : (label?.[1] ?? ''));
      if (INGREDIENTS_TITLE.test(title)) {
        section = 'ingredients';
      } else {
        const kind = sectionKind(title);
        // Steps, Notes and Source are sections of the notes (see `recipeSections`); written the same way
        // whatever the member's heading level or language.
        if (kind)
          notes.push(`## ${kind === 'steps' ? 'Steps' : kind === 'notes' ? 'Notes' : 'Source'}`);
        // Any other heading the member wrote stays with the notes.
        else notes.push(line.trim());
        section = kind === 'notes' || kind === 'source' ? 'verbatim' : 'other';
      }
      continue;
    }

    if (section === 'ingredients') {
      const bulleted = /^\s*(?:[-*+•]|\d+[.)])\s+/.test(line);
      // "For the sauce:" names a group, it is not an ingredient.
      if (!bulleted && plain(line).endsWith(':')) continue;
      const draft = draftLineFromText(newId(), line);
      if (draft) lines.push(draft);
      continue;
    }

    const meta = section === 'body' ? META.exec(line) : null;
    if (meta) {
      if (!/^tags?$/i.test(meta[1])) servings = parseServings(meta[2]);
      continue;
    }
    const typed = section === 'body' ? TYPE_META.exec(line) : null;
    if (typed) {
      // A value that names no type (a typo) is dropped with the line, like `tags:`.
      type = TYPE_WORDS[normalizeIngredientName(plain(typed[2]))] ?? null;
      continue;
    }
    const macro = section === 'body' ? NUTRITION_META.exec(line) : null;
    if (macro) {
      const amount = parseAmount(macro[2]);
      if (/^(kcal|calories|calorias)$/i.test(macro[1])) kcal = amount;
      else protein = amount;
      continue;
    }
    notes.push(line);
  }

  const warnings: DraftWarning[] = [];
  let name = closingHashesRemoved(plain(chunk.heading ?? ''));
  if (!name) warnings.push('missingName');
  name = name.slice(0, MAX_NAME).trim();

  let noteText = normalizeRecipeNotes(notes.join('\n')) ?? '';
  if (noteText.length > MAX_NOTES) {
    noteText = noteText.slice(0, MAX_NOTES).trimEnd();
    warnings.push('notesTruncated');
  }
  if (lines.length === 0) warnings.push('noIngredients');
  if (lines.length > MAX_INGREDIENTS) {
    lines.length = MAX_INGREDIENTS;
    warnings.push('ingredientsTruncated');
  }

  const nutrition =
    kcal !== null && protein !== null && kcal <= MAX_KCAL && protein <= MAX_PROTEIN
      ? { kcal, protein }
      : null;
  return { name, servings, nutrition, type, notes: noteText || null, lines, warnings };
}

/** Obsidian front matter at the top of a note: only `servings` / `title` are read, the rest is dropped. */
function takeFrontMatter(lines: string[]): { meta: Record<string, string>; rest: string[] } {
  if (lines[0]?.trim() !== '---') return { meta: {}, rest: lines };
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (end < 0) return { meta: {}, rest: lines };
  const meta: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const pair = /^\s*([\p{L}\w-]+)\s*:\s*(.*)$/u.exec(line);
    if (pair) meta[pair[1].toLowerCase()] = plain(pair[2].replace(/^["']|["']$/g, ''));
  }
  return { meta, rest: lines.slice(end + 1) };
}

/**
 * Reads every recipe in a piece of markdown. A top-level `# ` heading starts a recipe; `servings:` (or
 * `doses:`, `porções:`) sets the servings; the list under an Ingredients / Ingredientes heading becomes the
 * ingredients; everything else becomes the notes. Text before the first heading counts as a recipe only
 * if it has an ingredient list. A recipe with no ingredients is still returned, with a warning.
 */
export function parseRecipesMarkdown(text: string, newId: () => string): DraftRecipe[] {
  // A line longer than any recipe line is cut: it bounds the work every pattern below can do on it.
  const all = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.length > MAX_LINE ? line.slice(0, MAX_LINE) : line));
  const { meta, rest } = takeFrontMatter(all);
  const chunks = splitRecipes(rest);
  const drafts = chunks.map((chunk) => parseChunk(chunk, newId));

  const [first, ...others] = drafts;
  const preamble = chunks[0].heading === null;
  // Text before the first heading is an introduction unless it holds an ingredient list.
  const recipes = preamble && first.lines.length === 0 ? others : drafts;

  const head = recipes[0];
  if (head && head === first) {
    // A note with no `# ` heading is one recipe: its name can come from the front matter.
    if (meta.title && !head.name) {
      head.name = meta.title.slice(0, MAX_NAME);
      head.warnings = head.warnings.filter((w) => w !== 'missingName');
    }
  }
  const servings = meta.servings ?? meta.doses ?? meta.porções ?? meta.porcoes;
  if (head && servings && head.servings === DEFAULT_SERVINGS)
    head.servings = parseServings(servings);
  return recipes;
}

// --- Writing ---

/** "1500 g", "2", "" (to taste): exact, so reading it back gives the same number and unit. */
function exactAmount(ingredient: Pick<RecipeIngredient, 'quantity' | 'unit'>): string {
  if (ingredient.quantity === null) return '';
  const value = String(Math.round(ingredient.quantity * 100) / 100);
  return ingredient.unit === 'unit' ? value : `${value} ${ingredient.unit}`;
}

/**
 * One ingredient as a line that reads back as the same ingredient. The plain "400 g Spaghetti" is used
 * unless it would be misread: "2 Cup noodles" would become 480 ml, "1000 Island dressing" a quantity. Then
 * a counted item is written "2 x Cup noodles" and an amount-less one "\\1000 Island dressing".
 */
function ingredientLine(ingredient: RecipeIngredient): string {
  const amount = exactAmount(ingredient);
  const candidates = [
    amount ? `${amount} ${ingredient.name}` : ingredient.name,
    amount ? `${amount} x ${ingredient.name}` : `\\${ingredient.name}`,
  ];
  const same = (text: string) => {
    const read = draftLineFromText('', text)?.ingredient;
    return (
      read?.name === ingredient.name &&
      read.quantity === ingredient.quantity &&
      read.unit === ingredient.unit
    );
  };
  const line = candidates.find(same) ?? candidates[0];
  // The pantry flag is written only where reading would not get it from the name alone.
  const guessed = isLikelyStaple(ingredient.name);
  const tag = ingredient.staple ? (guessed ? '' : ' #pantry') : guessed ? ' #fresh' : '';
  return `- ${line}${tag}`;
}

/**
 * A recipe as markdown, in the format `parseRecipesMarkdown` reads, so a recipe survives a round trip.
 * Amounts stay as stored (1500 g, not 1.5 kg). Steps, notes and source go last, as the sections of `recipeSections`, and read back the same.
 */
export function formatRecipeMarkdown(recipe: RecipeInput): string {
  const out = [`# ${recipe.name}`, `servings: ${recipe.servings}`];
  if (recipe.type) out.push(`type: ${recipe.type}`);
  if (recipe.nutrition)
    out.push(`kcal: ${recipe.nutrition.kcal}`, `protein: ${recipe.nutrition.protein}`);
  out.push('', '## Ingredients');
  for (const ingredient of recipe.ingredients) out.push(ingredientLine(ingredient));
  // Steps, notes and source, in the sections the app edits; old free text is written under "## Notes".
  const tail = formatRecipeNotes(parseRecipeNotes(recipe.notes));
  if (tail) {
    const lines = tail.split('\n').map((line) => (H1_IN_NOTES.test(line) ? `\\${line}` : line));
    out.push('', ...lines);
  }
  return `${out.join('\n')}\n`;
}

// --- Importing ---

/** Whether a line can be imported as read. Unusable lines (no name, impossible quantity) are left out. */
export const isImportable = (line: DraftLine): boolean =>
  line.flag === null || !UNUSABLE.includes(line.flag);

/** The draft as the recipe that would be saved. */
export function draftToRecipeInput(draft: DraftRecipe): RecipeInput {
  return {
    name: draft.name,
    servings: draft.servings,
    // Only when the note gave values: a recipe without them is the same as before nutrition existed.
    ...(draft.nutrition ? { nutrition: draft.nutrition } : {}),
    ...(draft.type ? { type: draft.type } : {}),
    notes: draft.notes,
    ingredients: draft.lines.filter(isImportable).map((line) => ({
      id: line.id,
      name: line.ingredient.name.slice(0, MAX_NAME),
      quantity: line.ingredient.quantity,
      unit: line.ingredient.unit,
      staple: line.ingredient.staple,
    })),
  };
}

/**
 * Flags the imported ingredients that are a typo of a name used more often, in the library or elsewhere in
 * the same import ("meet" when "meat" is used). A line the parser already doubts keeps its own flag.
 */
export function flagSimilarNames(
  drafts: DraftRecipe[],
  library: Pick<Recipe, 'ingredients'>[],
): DraftRecipe[] {
  const inImport = drafts.map((draft) => ({
    ingredients: draft.lines.map((line) => ({ name: line.ingredient.name })),
  })) as Pick<Recipe, 'ingredients'>[];
  const inLibrary = new Set(knownIngredientNames(library).map((k) => ingredientMatchKey(k.name)));
  // A name the library already uses outranks any count the import alone can reach.
  const rank = (name: KnownName) =>
    name.count + (inLibrary.has(ingredientMatchKey(name.name)) ? 1000 : 0);
  const known = knownIngredientNames([...library, ...inImport]).map((k) => ({
    name: k.name,
    count: rank(k),
  }));
  const counts = new Map(known.map((k) => [ingredientMatchKey(k.name), k.count]));
  return drafts.map((draft) => ({
    ...draft,
    lines: draft.lines.map((line) => {
      if (line.flag) return line;
      const own = counts.get(ingredientMatchKey(line.ingredient.name)) ?? 0;
      const suggestion = similarKnownName(line.ingredient.name, known, own);
      return suggestion ? { ...line, flag: 'similarName' as const, suggestion } : line;
    }),
  }));
}
