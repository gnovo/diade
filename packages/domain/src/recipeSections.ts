/**
 * The structure inside a recipe's `notes`. The column stays one markdown text (no migration, and the
 * markdown import and export are the same text), but it is written in sections the app can edit:
 *
 *   ## Steps      a numbered list, one step per line
 *   ## Notes      free text
 *   ## Source     a link or an author
 *
 * Text with no known heading (every recipe saved before sections existed) reads as notes, and is written
 * back under "## Notes" the next time it is saved. Only these three level-2 headings are structure: any
 * other heading stays inside the free text. A line of free text that would read as one of them is
 * written with a leading backslash and read back without it, so nothing a member types is lost.
 */

import { normalizeIngredientName } from './recipes';

/** The longest a single step may be. */
export const MAX_STEP_LENGTH = 600;

export type RecipeSectionKind = 'steps' | 'notes' | 'source';

export interface RecipeSections {
  steps: string[];
  /** Free text. */
  notes: string;
  source: string;
}

const KINDS: Array<[RecipeSectionKind, RegExp]> = [
  [
    'steps',
    /^(?:steps?|method|instructions?|directions?|preparation|preparacao|modo de preparo|modo de preparacao|passos?)$/,
  ],
  ['notes', /^(?:notes?|notas?)$/],
  ['source', /^(?:source|fonte)$/],
];

/** Which section a heading's title opens, English or Portuguese; null for any other title. */
export function sectionKind(title: string): RecipeSectionKind | null {
  const normalized = normalizeIngredientName(title.replace(/:$/, ''));
  return KINDS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

/**
 * A level-2 heading ("## Title"), with the backslashes in front of it if it was escaped. Plain string work,
 * not a pattern: a regular expression with two runs of whitespace around a capture backtracks badly on a
 * long line of spaces and tabs, and this reads text a member pasted.
 */
function headingOf(line: string): { slashes: string; title: string } | null {
  let slashes = 0;
  while (line[slashes] === '\\') slashes++;
  if (line.slice(slashes, slashes + 2) !== '##') return null;
  const rest = line.slice(slashes + 2);
  if (rest[0] !== ' ' && rest[0] !== '\t') return null;
  const title = rest.trim();
  return title ? { slashes: line.slice(0, slashes), title } : null;
}

/** The title of a level-2 heading that is not escaped, else null. */
export const levelTwoTitle = (line: string): string | null => {
  const heading = headingOf(line);
  return heading && heading.slashes === '' ? heading.title : null;
};

const LIST_MARKER = /^\s*(?:\d+[.)]|[-*+•])\s+/;

/** Free-text lines that would read as a section heading get one more backslash. */
const escapeLine = (line: string): string => {
  const heading = headingOf(line);
  return heading && sectionKind(heading.title) ? `\\${line}` : line;
};

const unescapeLine = (line: string): string => {
  const heading = headingOf(line);
  return heading?.slashes && sectionKind(heading.title) ? line.slice(1) : line;
};

export function parseRecipeNotes(text: string | null | undefined): RecipeSections {
  const lines: Record<RecipeSectionKind, string[]> = { steps: [], notes: [], source: [] };
  let current: RecipeSectionKind = 'notes';
  for (const line of (text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const title = levelTwoTitle(line);
    const kind = title === null ? null : sectionKind(title);
    if (kind) {
      // A second section of the same kind continues the first, set apart by a blank line.
      if (lines[kind].length > 0) lines[kind].push('');
      current = kind;
      continue;
    }
    lines[current].push(unescapeLine(line));
  }
  return {
    steps: lines.steps.map((line) => line.replace(LIST_MARKER, '').trim()).filter(Boolean),
    notes: lines.notes.join('\n').trim(),
    source: lines.source.join('\n').trim(),
  };
}

/** A step is one paragraph: line breaks become spaces. Split and joined, not matched, so a long run of spaces is cheap. */
export const cleanStep = (step: string): string =>
  step
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');

/** The sections as the text stored in `notes`; null when every section is empty. */
export function formatRecipeNotes(sections: RecipeSections): string | null {
  const steps = sections.steps.map(cleanStep).filter(Boolean);
  const notes = sections.notes.trim();
  const source = sections.source.trim();
  const parts: string[] = [];
  if (steps.length > 0) {
    parts.push(['## Steps', ...steps.map((step, i) => `${i + 1}. ${step}`)].join('\n'));
  }
  if (notes) parts.push(['## Notes', ...notes.split('\n').map(escapeLine)].join('\n'));
  if (source) parts.push(['## Source', ...source.split('\n').map(escapeLine)].join('\n'));
  return parts.length > 0 ? parts.join('\n\n') : null;
}

/** Any notes text in the current form: old free text gains its "## Notes" heading. */
export const normalizeRecipeNotes = (text: string | null | undefined): string | null =>
  formatRecipeNotes(parseRecipeNotes(text));
