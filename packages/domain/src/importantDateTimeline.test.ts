import { describe, expect, it } from 'vitest';
import type { ImportantDateType } from './importantDates';
import {
  buildTimeline,
  durationBetween,
  type TimelineEntry,
  type TimelineSource,
  togetherProgress,
  upcomingBirthdays,
} from './importantDateTimeline';

// Local-time constructor keeps these tests independent of the machine's timezone.
const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 15, 30);
const TODAY = local(2026, 11, 8);

const make = (
  id: string,
  type: ImportantDateType,
  date: string,
  over: Partial<TimelineSource> = {},
): TimelineSource => ({
  id,
  type,
  date,
  repeat: 'none',
  countFirstDay: false,
  pinned: false,
  ...over,
});

// The couple's real dates, as read from the app.
const DATES: TimelineSource[] = [
  make('me', 'my_birthday', '1988-02-04', { repeat: 'yearly' }),
  make('her', 'partner_birthday', '1991-06-19', { repeat: 'yearly' }),
  make('first', 'first_day', '2020-08-18', { repeat: 'yearly', pinned: true, countFirstDay: true }),
  make('bruno', 'other', '2022-04-30'),
  make('porto', 'trip', '2022-04-23'),
  make('moved', 'other', '2022-01-15'),
  make('lisbon', 'trip', '2020-12-01'),
  make('santo', 'trip', '2020-10-02'),
];

const shape = (entries: Array<TimelineEntry<TimelineSource>>) =>
  entries.map((e) => {
    switch (e.kind) {
      case 'milestone':
        return e.item.id;
      case 'tick':
        return `${e.years}y${e.future ? '+' : ''}`;
      case 'year':
        return String(e.year);
      case 'gap':
        return `gap${e.days}`;
      default:
        return 'today';
    }
  });

describe('durationBetween', () => {
  it('counts calendar years, months and days', () => {
    expect(durationBetween(local(2020, 8, 18), local(2026, 11, 8))).toEqual({
      years: 6,
      months: 2,
      days: 21,
    });
  });

  it('is zero on the same day and borrows from the month before', () => {
    expect(durationBetween(local(2026, 11, 8), local(2026, 11, 8))).toEqual({
      years: 0,
      months: 0,
      days: 0,
    });
    expect(durationBetween(local(2026, 1, 31), local(2026, 3, 1))).toEqual({
      years: 0,
      months: 1,
      days: 1,
    });
  });
});

describe('buildTimeline', () => {
  it('lists the couple story newest first, with ticks, gaps and the Today marker', () => {
    expect(shape(buildTimeline(DATES, TODAY, 'all'))).toEqual([
      '7y+',
      'today',
      '2026',
      '6y',
      '2025',
      '5y',
      '2024',
      '4y',
      '2023',
      '3y',
      '2022',
      '2y',
      'bruno',
      'gap7',
      'porto',
      'gap98',
      'moved',
      '2021',
      '1y',
      '2020',
      'lisbon',
      'gap60',
      'santo',
      'gap45',
      'first',
    ]);
  });

  it('keeps birthdays off the rail', () => {
    const ids = buildTimeline(DATES, TODAY, 'all').flatMap((e) =>
      e.kind === 'milestone' ? [e.item.id] : [],
    );
    expect(ids).not.toContain('me');
    expect(ids).not.toContain('her');
  });

  it('marks the origin and the dates still ahead', () => {
    const planned = make('madeira', 'trip', '2027-03-12');
    const entries = buildTimeline([...DATES, planned], TODAY, 'all');
    const first = entries.find((e) => e.kind === 'milestone' && e.item.id === 'first');
    expect(first).toMatchObject({ origin: true, future: false });
    expect(shape(entries).slice(0, 4)).toEqual(['7y+', 'madeira', 'today', '2026']);
    expect(entries.find((e) => e.kind === 'milestone' && e.item.id === 'madeira')).toMatchObject({
      future: true,
      origin: false,
    });
  });

  it('shows only that group under a filter, with no ticks and no Today marker', () => {
    expect(shape(buildTimeline(DATES, TODAY, 'trips'))).toEqual([
      '2022',
      'porto',
      'gap508',
      '2020',
      'lisbon',
      'gap60',
      'santo',
    ]);
  });

  it('keeps the Today marker for a planned trip so the dashed part has a meaning', () => {
    const planned = make('madeira', 'trip', '2027-03-12');
    expect(shape(buildTimeline([planned, ...DATES], TODAY, 'trips')).slice(0, 3)).toEqual([
      'madeira',
      'today',
      '2022',
    ]);
  });

  it('falls back to the oldest couple date when nothing is featured', () => {
    const entries = buildTimeline(
      DATES.map((d) => ({ ...d, pinned: false })),
      TODAY,
      'couple',
    );
    expect(entries.find((e) => e.kind === 'milestone' && e.item.id === 'first')).toMatchObject({
      origin: true,
    });
  });

  it('has no ticks when the origin does not repeat', () => {
    const entries = buildTimeline(
      [make('baby', 'expecting_baby', '2026-03-01', { pinned: true })],
      TODAY,
      'all',
    );
    expect(shape(entries)).toEqual(['today', '2026', 'baby']);
  });

  it('returns nothing for the birthdays filter and for no dates', () => {
    expect(buildTimeline(DATES, TODAY, 'birthdays')).toEqual([]);
    expect(buildTimeline([], TODAY, 'all')).toEqual([]);
  });

  it('puts an anniversary that falls today below the marker, not ahead of it', () => {
    const entries = buildTimeline(DATES, local(2026, 8, 18), 'all');
    expect(shape(entries).slice(0, 4)).toEqual(['7y+', 'today', '2026', '6y']);
  });
});

describe('upcomingBirthdays', () => {
  it('lists the soonest first with the age they turn', () => {
    const birthdays = upcomingBirthdays(DATES, TODAY);
    expect(birthdays.map((b) => [b.item.id, b.daysLeft, b.turns])).toEqual([
      ['me', 88, 39],
      ['her', 223, 36],
    ]);
  });

  it('is empty when there are none', () => {
    expect(upcomingBirthdays([make('trip', 'trip', '2022-04-23')], TODAY)).toEqual([]);
  });
});

describe('togetherProgress', () => {
  it('gives the elapsed time and the way to the next anniversary', () => {
    const first = DATES.find((d) => d.id === 'first') as TimelineSource;
    const progress = togetherProgress(first, TODAY);
    expect(progress?.elapsed).toEqual({ years: 6, months: 2, days: 21 });
    expect(progress?.next).toEqual({ years: 7, daysLeft: 283 });
    expect(progress?.progress).toBeCloseTo(82 / 365, 2);
  });

  it('has no next anniversary for a one-off date and none for a date ahead', () => {
    expect(togetherProgress(make('x', 'other', '2022-04-30'), TODAY)?.next).toBeNull();
    expect(togetherProgress(make('y', 'trip', '2027-03-12'), TODAY)).toBeNull();
  });
});
