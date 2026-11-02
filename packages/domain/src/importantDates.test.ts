import { describe, it, expect } from 'vitest';
import {
  anniversaryInYear,
  completedYears,
  daysBetween,
  describeImportantDate,
  elapsedDays,
  nextOccurrence,
  parseDateOnly,
  sortImportantDates,
  upcomingAnniversaries,
  type ImportantDateTiming,
} from './importantDates';

// Local-time constructor keeps these tests independent of the machine's timezone.
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30);
const item = (date: string, over: Partial<ImportantDateTiming> = {}): ImportantDateTiming => ({
  date,
  repeat: 'none',
  countFirstDay: false,
  ...over,
});

describe('parseDateOnly', () => {
  it('parses real days and rejects impossible ones', () => {
    expect(parseDateOnly('2020-08-18')?.getDate()).toBe(18);
    expect(parseDateOnly('2026-02-31')).toBeNull();
    expect(parseDateOnly('18/08/2020')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days regardless of time of day', () => {
    expect(daysBetween(new Date(2026, 10, 2, 23, 59), new Date(2026, 10, 3, 0, 1))).toBe(1);
    expect(daysBetween(local(2026, 11, 2), local(2026, 11, 2))).toBe(0);
    expect(daysBetween(local(2026, 11, 3), local(2026, 11, 2))).toBe(-1);
  });

  it('is not thrown off by daylight-saving changes', () => {
    // Spans the late-March and late-October clock changes in Europe and the US.
    expect(daysBetween(local(2026, 3, 1), local(2026, 4, 1))).toBe(31);
    expect(daysBetween(local(2026, 10, 1), local(2026, 11, 1))).toBe(31);
  });
});

describe('anniversaryInYear', () => {
  it('keeps the month and day', () => {
    expect(anniversaryInYear(local(2020, 8, 18), 2027).getTime()).toBe(new Date(2027, 7, 18).getTime());
  });

  it('moves a 29 February date to 28 February in non-leap years only', () => {
    const leapDay = local(2020, 2, 29);
    expect(anniversaryInYear(leapDay, 2027)).toEqual(new Date(2027, 1, 28));
    expect(anniversaryInYear(leapDay, 2028)).toEqual(new Date(2028, 1, 29));
  });
});

describe('nextOccurrence', () => {
  it('returns today when the date is today', () => {
    expect(nextOccurrence(local(2020, 11, 2), local(2026, 11, 2))).toEqual(new Date(2026, 10, 2));
  });

  it('rolls to next year once this year\'s date has passed', () => {
    expect(nextOccurrence(local(1988, 2, 4), local(2026, 11, 2))).toEqual(new Date(2027, 1, 4));
  });

  it('stays in this year while the date is still ahead', () => {
    expect(nextOccurrence(local(1991, 6, 19), local(2026, 3, 1))).toEqual(new Date(2026, 5, 19));
  });

  it('treats a future date as its own next occurrence', () => {
    expect(nextOccurrence(local(2027, 5, 10), local(2026, 11, 2))).toEqual(new Date(2027, 4, 10));
  });
});

describe('describeImportantDate', () => {
  const today = local(2026, 11, 2);

  it('counts up for a one-off date in the past', () => {
    const status = describeImportantDate(item('2022-01-15'), today);
    expect(status.kind).toBe('since');
    expect(status.days).toBe(daysBetween(new Date(2022, 0, 15), today));
  });

  it('counts down for a one-off date in the future', () => {
    expect(describeImportantDate(item('2026-12-01'), today)).toMatchObject({ kind: 'left', days: 29 });
  });

  it('reports today for a one-off date that is today', () => {
    expect(describeImportantDate(item('2026-11-02'), today)).toMatchObject({ kind: 'today', days: 0 });
  });

  it('counts down to the next occurrence for yearly dates', () => {
    const status = describeImportantDate(item('1988-02-04', { repeat: 'yearly' }), today);
    expect(status.kind).toBe('left');
    expect(status.days).toBe(daysBetween(today, new Date(2027, 1, 4)));
  });

  it('reports today on the anniversary of a yearly date', () => {
    expect(describeImportantDate(item('2020-11-02', { repeat: 'yearly' }), today)).toMatchObject({
      kind: 'today',
      days: 0,
    });
  });

  it('includes the first day in a since-count only when asked', () => {
    const plain = describeImportantDate(item('2026-10-31'), today);
    const first = describeImportantDate(item('2026-10-31', { countFirstDay: true }), today);
    expect(plain.days).toBe(2);
    expect(first.days).toBe(3);
  });

  it('does not add the first day to a countdown', () => {
    expect(describeImportantDate(item('2026-11-05', { countFirstDay: true }), today).days).toBe(3);
  });
});

describe('elapsedDays', () => {
  const today = local(2026, 11, 2);

  it('is null for a date that has not happened yet', () => {
    expect(elapsedDays(item('2026-11-03'), today)).toBeNull();
  });

  it('is 0 on the day itself, or 1 when that day counts as the first', () => {
    expect(elapsedDays(item('2026-11-02'), today)).toBe(0);
    expect(elapsedDays(item('2026-11-02', { countFirstDay: true }), today)).toBe(1);
  });
});

describe('upcomingAnniversaries', () => {
  it('lists the next milestones, skipping ones already passed', () => {
    const list = upcomingAnniversaries({ date: '2020-08-18' }, local(2026, 11, 2), 4);
    expect(list.map((a) => a.years)).toEqual([7, 8, 9, 10]);
    expect(list[0].date).toEqual(new Date(2027, 7, 18));
    expect(list[0].daysLeft).toBe(daysBetween(local(2026, 11, 2), new Date(2027, 7, 18)));
  });

  it('includes an anniversary that falls today', () => {
    const list = upcomingAnniversaries({ date: '2020-11-02' }, local(2026, 11, 2), 2);
    expect(list.map((a) => a.years)).toEqual([6, 7]);
    expect(list[0].daysLeft).toBe(0);
  });

  it('is empty for a malformed date', () => {
    expect(upcomingAnniversaries({ date: 'nope' }, local(2026, 11, 2))).toEqual([]);
  });
});

describe('completedYears', () => {
  it('counts a year only once the anniversary has been reached', () => {
    expect(completedYears({ date: '2020-08-18' }, local(2027, 8, 17))).toBe(6);
    expect(completedYears({ date: '2020-08-18' }, local(2027, 8, 18))).toBe(7);
  });

  it('is null before the date happens', () => {
    expect(completedYears({ date: '2030-01-01' }, local(2026, 11, 2))).toBeNull();
  });
});

describe('sortImportantDates', () => {
  it('puts upcoming dates first, soonest first, then passed dates, most recent first', () => {
    const today = local(2026, 11, 2);
    const sorted = sortImportantDates(
      [
        item('2022-01-15'), // since, long ago
        item('2026-12-01'), // left, 29 days
        item('2026-10-01'), // since, recent
        item('1988-02-04', { repeat: 'yearly' }), // left, ~94 days
        item('2026-11-05'), // left, 3 days
      ],
      today,
    );
    expect(sorted.map((i) => i.date)).toEqual([
      '2026-11-05',
      '2026-12-01',
      '1988-02-04',
      '2026-10-01',
      '2022-01-15',
    ]);
  });
});
