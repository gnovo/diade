import { describe, it, expect } from 'vitest';
import {
  parseRecurrenceRule,
  expandEventOccurrences,
  startOfLocalDay,
  addLocalDays,
  isSameLocalDay,
} from './recurrence';

// Local-time constructor keeps these tests independent of the machine's timezone.
const local = (y: number, m: number, d: number, h = 19, min = 0) => new Date(y, m - 1, d, h, min);

function eventAt(start: Date, durationMinutes: number, rule: string | null = null) {
  return {
    startAt: start.toISOString(),
    endAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
    recurrenceRule: rule,
  };
}

describe('parseRecurrenceRule', () => {
  it('returns null for missing or unsupported rules', () => {
    expect(parseRecurrenceRule(null)).toBeNull();
    expect(parseRecurrenceRule('')).toBeNull();
    expect(parseRecurrenceRule('FREQ=HOURLY')).toBeNull();
  });

  it('parses frequency, interval, count and until', () => {
    expect(parseRecurrenceRule('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      count: 5,
      until: null,
    });
    const until = parseRecurrenceRule('FREQ=DAILY;UNTIL=20261231')?.until;
    expect(until?.toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });

  it('defaults interval to 1 when missing or invalid', () => {
    expect(parseRecurrenceRule('FREQ=DAILY;INTERVAL=0')?.interval).toBe(1);
    expect(parseRecurrenceRule('FREQ=DAILY')?.interval).toBe(1);
  });
});

describe('expandEventOccurrences', () => {
  it('returns a single non-recurring event only when it overlaps the window', () => {
    const event = eventAt(local(2026, 11, 5), 60);
    const inside = expandEventOccurrences(event, local(2026, 11, 1), local(2026, 11, 30));
    expect(inside).toHaveLength(1);
    const outside = expandEventOccurrences(event, local(2026, 12, 1), local(2026, 12, 30));
    expect(outside).toHaveLength(0);
  });

  it('expands weekly events with an interval inside the window', () => {
    const event = eventAt(local(2026, 11, 6), 60, 'FREQ=WEEKLY;INTERVAL=2');
    const occ = expandEventOccurrences(event, local(2026, 11, 1), local(2026, 11, 30));
    expect(occ.map((o) => o.startAt.getDate())).toEqual([6, 20]);
    expect(occ.every((o) => o.startAt.getHours() === 19)).toBe(true);
  });

  it('respects COUNT across the whole series, not only the window', () => {
    const event = eventAt(local(2026, 11, 1), 60, 'FREQ=DAILY;COUNT=3');
    const occ = expandEventOccurrences(event, local(2026, 11, 2), local(2026, 11, 30));
    expect(occ.map((o) => o.startAt.getDate())).toEqual([2, 3]);
  });

  it('stops at UNTIL', () => {
    const event = eventAt(local(2026, 11, 1), 60, 'FREQ=DAILY;UNTIL=20261103T000000Z');
    const occ = expandEventOccurrences(event, local(2026, 11, 1), local(2026, 11, 30));
    expect(occ.length).toBeGreaterThanOrEqual(2);
    expect(occ.length).toBeLessThanOrEqual(4);
    expect(occ[occ.length - 1].startAt.getDate()).toBeLessThanOrEqual(4);
  });

  it('skips month-end dates that do not exist (RFC 5545) rather than clamping', () => {
    const event = eventAt(local(2026, 1, 31), 60, 'FREQ=MONTHLY');
    const occ = expandEventOccurrences(event, local(2026, 1, 1), local(2026, 4, 30));
    // Jan 31 and Mar 31 exist; Feb and Apr do not have a 31st.
    expect(occ.map((o) => `${o.startAt.getMonth() + 1}-${o.startAt.getDate()}`)).toEqual([
      '1-31',
      '3-31',
    ]);
  });

  it('expands yearly important dates, skipping 29 February in non-leap years', () => {
    const event = eventAt(local(2024, 2, 29), 24 * 60, 'FREQ=YEARLY');
    const occ = expandEventOccurrences(event, local(2025, 1, 1), local(2028, 12, 31));
    expect(occ.map((o) => o.startAt.getFullYear())).toEqual([2028]);
  });

  it('keeps duration for every occurrence', () => {
    const event = eventAt(local(2026, 11, 1), 90, 'FREQ=DAILY;COUNT=2');
    const occ = expandEventOccurrences(event, local(2026, 11, 1), local(2026, 11, 2));
    expect(occ.every((o) => o.endAt.getTime() - o.startAt.getTime() === 90 * 60_000)).toBe(true);
  });
});

describe('local day helpers', () => {
  it('computes start of day and day arithmetic in local time', () => {
    const d = local(2026, 11, 1, 15, 45);
    expect(startOfLocalDay(d).getHours()).toBe(0);
    expect(isSameLocalDay(addLocalDays(d, 1), local(2026, 11, 2))).toBe(true);
    expect(isSameLocalDay(d, local(2026, 11, 2))).toBe(false);
  });
});
