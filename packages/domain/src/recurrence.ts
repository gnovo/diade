/**
 * Recurrence and local-calendar helpers.
 *
 * Supports the RRULE subset Díade uses: FREQ (DAILY | WEEKLY | MONTHLY | YEARLY),
 * INTERVAL, COUNT and UNTIL. Expansion happens on the client in local time so
 * that "19:30 every Friday" stays at 19:30 across daylight-saving changes.
 */

export type RecurrenceFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ParsedRecurrence {
  freq: RecurrenceFrequency;
  interval: number;
  count: number | null;
  until: Date | null;
}

export interface Occurrence {
  startAt: Date;
  endAt: Date;
  /** Zero-based position in the series; 0 is the original event. */
  index: number;
}

const FREQUENCIES: readonly RecurrenceFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

// Safety valve: a daily series started in 1990 needs ~13k iterations to reach 2026.
const MAX_ITERATIONS = 20_000;

export function parseRecurrenceRule(rule: string | null | undefined): ParsedRecurrence | null {
  if (!rule) return null;

  const parts = new Map<string, string>();
  for (const segment of rule.replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = segment.split('=');
    if (key && value) parts.set(key.trim().toUpperCase(), value.trim());
  }

  const freq = parts.get('FREQ') as RecurrenceFrequency | undefined;
  if (!freq || !FREQUENCIES.includes(freq)) return null;

  const interval = Math.max(1, Number.parseInt(parts.get('INTERVAL') ?? '1', 10) || 1);
  const countValue = Number.parseInt(parts.get('COUNT') ?? '', 10);
  const untilRaw = parts.get('UNTIL');

  return {
    freq,
    interval,
    count: Number.isFinite(countValue) && countValue > 0 ? countValue : null,
    until: untilRaw ? parseUntil(untilRaw) : null,
  };
}

function parseUntil(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/i.exec(value);
  if (!match) return null;
  const [, year, month, day, hour = '23', minute = '59', second = '59'] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)),
  );
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Returns the start of the n-th step of a series (n = 0 is the original start),
 * or null when the step does not exist (e.g. the 31st in a 30-day month).
 * RFC 5545 says such invalid dates are skipped rather than clamped.
 */
function stepFrom(start: Date, freq: RecurrenceFrequency, steps: number): Date | null {
  const next = new Date(start.getTime());
  switch (freq) {
    case 'DAILY':
      next.setDate(next.getDate() + steps);
      return next;
    case 'WEEKLY':
      next.setDate(next.getDate() + steps * 7);
      return next;
    case 'MONTHLY': {
      const day = start.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + steps);
      if (day > daysInMonth(next)) return null;
      next.setDate(day);
      return next;
    }
    case 'YEARLY': {
      const month = start.getMonth();
      const day = start.getDate();
      next.setDate(1);
      next.setFullYear(start.getFullYear() + steps);
      next.setMonth(month);
      if (day > daysInMonth(next)) return null;
      next.setDate(day);
      return next;
    }
  }
}

function overlapsWindow(startAt: Date, endAt: Date, windowStart: Date, windowEnd: Date): boolean {
  return endAt.getTime() >= windowStart.getTime() && startAt.getTime() <= windowEnd.getTime();
}

/**
 * Expands an event (and its recurrence rule, if any) into concrete occurrences
 * that overlap the [windowStart, windowEnd] range, in chronological order.
 */
export function expandEventOccurrences(
  event: { startAt: string; endAt: string; recurrenceRule: string | null },
  windowStart: Date,
  windowEnd: Date,
): Occurrence[] {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  const durationMs = end.getTime() - start.getTime();
  const rule = parseRecurrenceRule(event.recurrenceRule);

  if (!rule) {
    return overlapsWindow(start, end, windowStart, windowEnd)
      ? [{ startAt: start, endAt: end, index: 0 }]
      : [];
  }

  const occurrences: Occurrence[] = [];
  let emitted = 0;

  for (let step = 0; step < MAX_ITERATIONS; step++) {
    const occurrenceStart = stepFrom(start, rule.freq, step * rule.interval);
    if (!occurrenceStart) continue; // invalid date for this frequency; does not count

    if (rule.until && occurrenceStart.getTime() > rule.until.getTime()) break;
    if (rule.count !== null && emitted >= rule.count) break;
    if (occurrenceStart.getTime() > windowEnd.getTime()) break;

    emitted += 1;
    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
    if (overlapsWindow(occurrenceStart, occurrenceEnd, windowStart, windowEnd)) {
      occurrences.push({ startAt: occurrenceStart, endAt: occurrenceEnd, index: step });
    }
  }

  return occurrences;
}

export function startOfLocalDay(date: Date): Date {
  const result = new Date(date.getTime());
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
