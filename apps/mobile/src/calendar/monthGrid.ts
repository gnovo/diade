/**
 * Month view maths: which days the grid shows and what marks each day. Pure, so the layout
 * rules are unit tested rather than read off a screen.
 */
import { addLocalDays } from '@diade/domain';
import type { AgendaEntry } from '../data/unifiedAgenda';

const GRID_DAYS = 42; // six weeks, so the grid keeps one height from month to month

export function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** The first day of the month `delta` months away. */
export function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** The week's first day, as `Date#getDay` numbers it: 1 is Monday (Portugal), 0 is Sunday. */
export function monthGridStart(month: Date, weekStartsOn: number = 1): Date {
  const first = firstOfMonth(month);
  const offset = (first.getDay() - weekStartsOn + 7) % 7;
  return addLocalDays(first, -offset);
}

/** Every day the grid shows for `month`: whole weeks, including days of the neighbouring months. */
export function monthGridDays(month: Date, weekStartsOn: number = 1): Date[] {
  const start = monthGridStart(month, weekStartsOn);
  return Array.from({ length: GRID_DAYS }, (_, i) => addLocalDays(start, i));
}

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface DayMarkers {
  /** Distinct colours, in the order they first appear, at most `max`. */
  colors: string[];
  /** How many further distinct colours did not fit. */
  extra: number;
}

export interface MarkerPalette {
  /** Díade events. */
  event: string;
  task: string;
  /** Important dates (anniversaries and the like). */
  date: string;
  /** A Google event whose calendar has no colour, or whose name the viewer may not see. */
  neutral: string;
}

/** The dots under a day number. One dot per calendar, so a busy day does not turn into a wall. */
export function dayMarkers(
  entries: AgendaEntry[],
  palette: MarkerPalette,
  max: number = 3,
): DayMarkers {
  const seen: string[] = [];
  for (const entry of entries) {
    let color: string;
    switch (entry.kind) {
      case 'external':
        color = entry.calendar?.color ?? palette.neutral;
        break;
      case 'event':
        color = palette.event;
        break;
      case 'task':
        if (entry.task.status === 'completed') continue;
        color = palette.task;
        break;
      case 'important_date':
        color = palette.date;
        break;
    }
    if (!seen.includes(color)) seen.push(color);
  }
  return { colors: seen.slice(0, max), extra: Math.max(0, seen.length - max) };
}
