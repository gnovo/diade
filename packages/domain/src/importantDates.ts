/**
 * Important ("special") dates: pure calendar maths.
 *
 * A special date is a plain calendar day (`YYYY-MM-DD`), not an instant, so a birthday or
 * anniversary never shifts with the device's time zone. Every function here compares
 * whole local calendar days and is independent of daylight-saving changes.
 */
import { parseLocalDateTime } from './datetime';
import { startOfLocalDay } from './recurrence';

export const IMPORTANT_DATE_TYPES = [
  'my_birthday',
  'partner_birthday',
  'first_day',
  'first_kiss',
  'engagement',
  'wedding',
  'expecting_baby',
  'their_birthday',
  'trip',
  'other_anniversary',
  'other',
] as const;

export type ImportantDateType = (typeof IMPORTANT_DATE_TYPES)[number];

/** The filter chips on the Dates screen. Every type belongs to exactly one group. */
export const IMPORTANT_DATE_GROUPS = ['couple', 'birthdays', 'trips', 'other'] as const;
export type ImportantDateGroup = (typeof IMPORTANT_DATE_GROUPS)[number];

/**
 * What the add flow asks for, and the defaults it applies, for one type. Keeping this in
 * the domain makes the wizard, the edit form and the tests agree.
 */
export interface ImportantDateTypeRules {
  group: ImportantDateGroup;
  /** The date repeats on a fixed rule, so the form does not offer a Repeat choice. */
  repeat: ImportantDateRepeat;
  /** Only Trip and Something else let the user choose. */
  repeatEditable: boolean;
  /** The date is about someone else, so the form asks for their name instead of a title. */
  needsPersonName: boolean;
  /** Couple dates can carry a running day count ("1,204 days"). */
  countFirstDayOption: boolean;
  countFirstDayDefault: boolean;
  /** Can be featured at the top of the Dates screen and on Today. */
  pinnable: boolean;
}

const couple = (over: Partial<ImportantDateTypeRules> = {}): ImportantDateTypeRules => ({
  group: 'couple',
  repeat: 'yearly',
  repeatEditable: false,
  needsPersonName: false,
  countFirstDayOption: false,
  countFirstDayDefault: false,
  pinnable: true,
  ...over,
});

export const IMPORTANT_DATE_TYPE_RULES: Record<ImportantDateType, ImportantDateTypeRules> = {
  first_day: couple({ countFirstDayOption: true, countFirstDayDefault: true }),
  first_kiss: couple({ countFirstDayOption: true, countFirstDayDefault: true }),
  engagement: couple(),
  wedding: couple(),
  expecting_baby: couple({ repeat: 'none' }),
  my_birthday: couple({ group: 'birthdays' }),
  partner_birthday: couple({ group: 'birthdays' }),
  their_birthday: couple({ group: 'birthdays', needsPersonName: true, pinnable: false }),
  trip: couple({ group: 'trips', repeat: 'none', repeatEditable: true, pinnable: false }),
  other_anniversary: couple({ group: 'other', needsPersonName: true, pinnable: false }),
  other: couple({ group: 'other', repeatEditable: true }),
};

export const importantDateGroup = (type: ImportantDateType): ImportantDateGroup =>
  IMPORTANT_DATE_TYPE_RULES[type].group;

/**
 * A date about someone else. These stay out of the Today "Us" strip and are shown on the
 * Calendar only while the member has switched them on.
 */
export const isThirdPartyDate = (type: ImportantDateType): boolean =>
  IMPORTANT_DATE_TYPE_RULES[type].needsPersonName;

/** Dates about the couple themselves: everything except other people's dates and trips. */
export const isCoupleDate = (type: ImportantDateType): boolean =>
  !isThirdPartyDate(type) && type !== 'trip';

export const IMPORTANT_DATE_REPEATS = ['none', 'yearly'] as const;
export type ImportantDateRepeat = (typeof IMPORTANT_DATE_REPEATS)[number];

/** The fields the date maths needs; a full ImportantDate record satisfies this. */
export interface ImportantDateTiming {
  date: string; // YYYY-MM-DD
  repeat: ImportantDateRepeat;
  countFirstDay: boolean;
}

/** Parses a `YYYY-MM-DD` value into local midnight, or null if malformed or not a real day. */
export function parseDateOnly(value: string): Date | null {
  return parseLocalDateTime(value, '00:00');
}

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). DST-safe. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * The anniversary of `date` in `year`. A 29 February date falls on 28 February in
 * non-leap years, so it is never skipped or pushed into March.
 */
export function anniversaryInYear(date: Date, year: number): Date {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 1 && day === 29) {
    const isLeap = new Date(year, 1, 29).getMonth() === 1;
    return new Date(year, 1, isLeap ? 29 : 28);
  }
  return new Date(year, month, day);
}

/**
 * The next time `date` is celebrated, today included. A date that has not happened yet
 * is its own next occurrence.
 */
export function nextOccurrence(date: Date, today: Date): Date {
  const start = startOfLocalDay(today);
  const original = startOfLocalDay(date);
  if (original.getTime() >= start.getTime()) return original;

  const thisYear = anniversaryInYear(original, start.getFullYear());
  return thisYear.getTime() >= start.getTime()
    ? thisYear
    : anniversaryInYear(original, start.getFullYear() + 1);
}

export type ImportantDateStatusKind = 'today' | 'left' | 'since';

export interface ImportantDateStatus {
  kind: ImportantDateStatusKind;
  /** Days remaining (`left`) or elapsed (`since`); 0 when `today`. */
  days: number;
  /** The day being counted to or from. For `since` this is the original date. */
  on: Date;
}

/**
 * The headline count shown in lists.
 * - Yearly dates count down to the next occurrence ("94 days left").
 * - One-off dates count down while ahead and count up once passed ("1753 days since").
 */
export function describeImportantDate(item: ImportantDateTiming, today: Date): ImportantDateStatus {
  const original = parseDateOnly(item.date);
  if (!original) return { kind: 'today', days: 0, on: startOfLocalDay(today) };

  if (item.repeat === 'yearly') {
    const next = nextOccurrence(original, today);
    const days = daysBetween(today, next);
    return days === 0 ? { kind: 'today', days: 0, on: next } : { kind: 'left', days, on: next };
  }

  const diff = daysBetween(today, original);
  if (diff === 0) return { kind: 'today', days: 0, on: original };
  if (diff > 0) return { kind: 'left', days: diff, on: original };
  return { kind: 'since', days: elapsedDays(item, today) ?? 0, on: original };
}

/**
 * Days since the original date, or null if it has not happened yet. With
 * `countFirstDay` the date itself is day 1, so the count is one higher.
 */
export function elapsedDays(item: ImportantDateTiming, today: Date): number | null {
  const original = parseDateOnly(item.date);
  if (!original) return null;
  const diff = daysBetween(original, today);
  if (diff < 0) return null;
  return diff + (item.countFirstDay ? 1 : 0);
}

export interface Anniversary {
  years: number;
  date: Date;
  daysLeft: number;
}

/** The next `count` yearly milestones from today (today included), e.g. 7, 8, 9 and 10 years. */
export function upcomingAnniversaries(
  item: Pick<ImportantDateTiming, 'date'>,
  today: Date,
  count = 4,
): Anniversary[] {
  const original = parseDateOnly(item.date);
  if (!original) return [];

  const start = startOfLocalDay(today);
  const results: Anniversary[] = [];
  // Bounded so a malformed far-past date can never loop for long.
  for (let years = 1; results.length < count && years <= 500; years += 1) {
    const date = anniversaryInYear(original, original.getFullYear() + years);
    if (date.getTime() < start.getTime()) continue;
    results.push({ years, date, daysLeft: daysBetween(start, date) });
  }
  return results;
}

/** Whole years completed on the given day, e.g. 7 on a 7th anniversary. */
export function completedYears(item: Pick<ImportantDateTiming, 'date'>, on: Date): number | null {
  const original = parseDateOnly(item.date);
  if (!original) return null;
  let years = on.getFullYear() - original.getFullYear();
  if (anniversaryInYear(original, on.getFullYear()).getTime() > startOfLocalDay(on).getTime())
    years -= 1;
  return years < 0 ? null : years;
}

/**
 * Orders dates for a list: what is coming up first (soonest first), then what has
 * passed (most recent first).
 */
export function sortImportantDates<T extends ImportantDateTiming>(items: T[], today: Date): T[] {
  const withStatus = items.map((item) => ({ item, status: describeImportantDate(item, today) }));
  const rank = (kind: ImportantDateStatusKind) => (kind === 'since' ? 1 : 0);
  withStatus.sort(
    (a, b) => rank(a.status.kind) - rank(b.status.kind) || a.status.days - b.status.days,
  );
  return withStatus.map((entry) => entry.item);
}
