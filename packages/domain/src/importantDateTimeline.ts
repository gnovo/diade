/**
 * The Dates screen as a story: a rail of milestones from the first date to today and beyond,
 * a birthdays list, and the running count at the top. Pure calendar maths on top of
 * `importantDates`, so none of it depends on the device's time zone.
 */
import {
  anniversaryInYear,
  completedYears,
  daysBetween,
  type ImportantDateGroup,
  type ImportantDateTiming,
  type ImportantDateType,
  importantDateGroup,
  nextOccurrence,
  parseDateOnly,
  upcomingAnniversaries,
} from './importantDates';
import { startOfLocalDay } from './recurrence';

/** What the timeline needs from a stored date. A full ImportantDate record satisfies this. */
export interface TimelineSource extends ImportantDateTiming {
  id: string;
  type: ImportantDateType;
  pinned: boolean;
}

export interface DurationParts {
  years: number;
  months: number;
  days: number;
}

/** `date` moved by whole months, with the day kept inside the target month (31 Jan + 1 month = 28 Feb). */
function addMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), last));
}

/** Calendar years, months and days from `from` to `to` (`from` is not after `to`). */
export function durationBetween(from: Date, to: Date): DurationParts {
  const end = startOfLocalDay(to);
  const begin = startOfLocalDay(from);
  let total = (end.getFullYear() - begin.getFullYear()) * 12 + end.getMonth() - begin.getMonth();
  if (addMonths(begin, total).getTime() > end.getTime()) total -= 1;
  if (total < 0) return { years: 0, months: 0, days: 0 };
  return {
    years: Math.floor(total / 12),
    months: total % 12,
    days: daysBetween(addMonths(begin, total), end),
  };
}

export type TimelineEntry<T extends TimelineSource> =
  | {
      kind: 'milestone';
      key: string;
      item: T;
      date: Date;
      /** Still ahead of today. */
      future: boolean;
      /** The date the whole story starts from. */
      origin: boolean;
    }
  | { kind: 'tick'; key: string; years: number; date: Date; future: boolean }
  | { kind: 'today'; key: string }
  | { kind: 'year'; key: string; year: number }
  | { kind: 'gap'; key: string; days: number; duration: DurationParts };

export type TimelineFilter = 'all' | ImportantDateGroup;

/** Safety bound so a malformed far-past origin can never loop for long. */
const MAX_TICKS = 200;

/**
 * Newest first: what is still ahead, then Today, then what has happened, with a year divider
 * where the year changes and the time between two neighbouring milestones written between them.
 *
 * - Birthdays never appear here; they have their own list.
 * - The origin is the featured couple date (or the oldest couple date). While the filter shows
 *   couple dates, a "N years together" tick marks each of its anniversaries up to the next one.
 */
export function buildTimeline<T extends TimelineSource>(
  items: T[],
  today: Date,
  filter: TimelineFilter,
): Array<TimelineEntry<T>> {
  if (filter === 'birthdays') return [];
  const start = startOfLocalDay(today);

  const dated = items
    .filter((item) => importantDateGroup(item.type) !== 'birthdays')
    .map((item) => ({ item, date: parseDateOnly(item.date) }))
    .filter((entry): entry is { item: T; date: Date } => entry.date !== null);

  const showsCouple = filter === 'all' || filter === 'couple';
  const visible = dated.filter(
    (e) => filter === 'all' || importantDateGroup(e.item.type) === filter,
  );

  const origin = showsCouple ? pickOrigin(dated, start) : null;

  type Sortable = Exclude<TimelineEntry<T>, { kind: 'today' | 'year' | 'gap' }>;
  const entries: Sortable[] = visible.map(({ item, date }) => ({
    kind: 'milestone',
    key: `m-${item.id}`,
    item,
    date,
    future: date.getTime() > start.getTime(),
    origin: origin !== null && item.id === origin.item.id,
  }));

  if (origin && origin.item.repeat === 'yearly') {
    for (let years = 1; years <= MAX_TICKS; years += 1) {
      const date = anniversaryInYear(origin.date, origin.date.getFullYear() + years);
      const future = date.getTime() > start.getTime();
      entries.push({ kind: 'tick', key: `t-${years}`, years, date, future });
      if (future) break; // the next anniversary is the last one shown
    }
  }

  // Newest first. A milestone sorts ahead of a tick on the same day.
  entries.sort((a, b) => b.date.getTime() - a.date.getTime() || (a.kind === 'tick' ? 1 : -1));

  const hasFuture = entries.some((e) => e.future);
  const showToday = showsCouple || hasFuture;

  const out: Array<TimelineEntry<T>> = [];
  let todayPlaced = false;
  let lastYear: number | null = null;

  entries.forEach((entry, index) => {
    if (!entry.future && !todayPlaced && showToday) {
      out.push({ kind: 'today', key: 'today' });
      todayPlaced = true;
    }
    if (!entry.future) {
      const year = entry.date.getFullYear();
      if (year !== lastYear) {
        out.push({ kind: 'year', key: `y-${year}`, year });
        lastYear = year;
      }
    }
    out.push(entry);

    // The time to the next (older) milestone, when nothing else sits between them.
    const older = entries[index + 1];
    if (
      entry.kind === 'milestone' &&
      older?.kind === 'milestone' &&
      older.future === entry.future
    ) {
      out.push({
        kind: 'gap',
        key: `g-${entry.key}`,
        days: daysBetween(older.date, entry.date),
        duration: durationBetween(older.date, entry.date),
      });
    }
  });

  // Nothing has happened yet (only future entries): the marker still closes the list.
  if (!todayPlaced && showToday && entries.length > 0) out.push({ kind: 'today', key: 'today' });
  return out;
}

/** The featured couple date, else the oldest couple date, as long as it has already happened. */
function pickOrigin<T extends TimelineSource>(
  dated: Array<{ item: T; date: Date }>,
  start: Date,
): { item: T; date: Date } | null {
  const past = dated.filter(
    (e) => importantDateGroup(e.item.type) === 'couple' && e.date.getTime() <= start.getTime(),
  );
  const pinned = past.find((e) => e.item.pinned);
  if (pinned) return pinned;
  const oldest = [...past].sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  return oldest ?? null;
}

export interface BirthdayEntry<T extends TimelineSource> {
  item: T;
  /** The next time it is celebrated. */
  next: Date;
  daysLeft: number;
  /** The age they turn, or null when the year of birth is not known to have passed. */
  turns: number | null;
}

/** Birthdays, the soonest first. */
export function upcomingBirthdays<T extends TimelineSource>(
  items: T[],
  today: Date,
): Array<BirthdayEntry<T>> {
  return items
    .filter((item) => importantDateGroup(item.type) === 'birthdays')
    .flatMap((item) => {
      const original = parseDateOnly(item.date);
      if (!original) return [];
      const next = nextOccurrence(original, today);
      const years = completedYears(item, next);
      return [
        {
          item,
          next,
          daysLeft: daysBetween(today, next),
          turns: years !== null && years > 0 ? years : null,
        },
      ];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface TogetherProgress {
  elapsed: DurationParts;
  /** The next yearly milestone, when the date repeats every year. */
  next: { years: number; daysLeft: number } | null;
  /** How far through the current year of the relationship today is, 0 to 1. */
  progress: number;
}

/** The running count under the day counter: years, months and days, and the way to the next anniversary. */
export function togetherProgress(item: ImportantDateTiming, today: Date): TogetherProgress | null {
  const original = parseDateOnly(item.date);
  if (!original) return null;
  const start = startOfLocalDay(today);
  if (original.getTime() > start.getTime()) return null;

  const elapsed = durationBetween(original, start);
  if (item.repeat !== 'yearly') return { elapsed, next: null, progress: 0 };

  const next = upcomingAnniversaries(item, today, 1)[0];
  if (!next) return { elapsed, next: null, progress: 0 };
  const previous =
    next.years === 1 ? original : anniversaryInYear(original, next.date.getFullYear() - 1);
  const span = daysBetween(previous, next.date);
  const done = daysBetween(previous, start);
  return {
    elapsed,
    next: { years: next.years, daysLeft: next.daysLeft },
    progress: span <= 0 ? 1 : Math.min(Math.max(done / span, 0), 1),
  };
}
