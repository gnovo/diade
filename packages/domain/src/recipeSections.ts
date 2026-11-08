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

/** A level-2 heading, with an optional run of backslashes in front (an escaped one). */
const HEADING = /^(\\*)##[ \t]+(.+?)[ \t]*$/;
const LIST_MARKER = /^\s*(?:\d+[.)]|[-*+•])\s+/;

/** Free-text lines that would read as a section heading get one more backslash. */
const escapeLine = (line: string): string => {
  const heading = HEADING.exec(line);
  return heading && sectionKind(heading[2]) ? `\\${line}` : line;
};

const unescapeLine = (line: string): string => {
  const heading = HEADING.exec(line);
  return heading?.[1] && sectionKind(heading[2]) ? line.slice(1) : line;
};

export function parseRecipeNotes(text: string | null | undefined): RecipeSections {
  const lines: Record<RecipeSectionKind, string[]> = { steps: [], notes: [], source: [] };
  let current: RecipeSectionKind = 'notes';
  for (const line of (text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    const kind = heading && !heading[1] ? sectionKind(heading[2]) : null;
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

/** A step is one paragraph: line breaks become spaces. */
export const cleanStep = (step: string): string => step.replace(/\s*\n\s*/g, ' ').trim();

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
