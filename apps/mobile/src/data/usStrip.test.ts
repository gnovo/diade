import type { ImportantDate } from '@diade/domain';
import { describe, expect, it } from 'vitest';
import { upcomingSpecialDates, usStrip } from './usStrip';

// Local-time constructor keeps these tests independent of the machine's timezone.
const now = new Date(2026, 10, 6, 15, 30); // 6 Nov 2026

const date = (id: string, day: string, over: Partial<ImportantDate> = {}): ImportantDate => ({
  id,
  spaceId: 's',
  creatorId: 'u',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  title: id,
  type: 'other',
  notes: null,
  personName: null,
  date: day,
  countFirstDay: false,
  repeat: 'none',
  pinned: false,
  alertOffsetDays: null,
  ...over,
});

describe('upcomingSpecialDates', () => {
  it('keeps what is ahead within the window, soonest first, and drops the past', () => {
    const list = upcomingSpecialDates(
      [
        date('later', '2026-11-30'),
        date('soon', '2026-11-10'),
        date('past', '2020-01-01'),
        date('far', '2027-06-01'),
      ],
      now,
      30,
    );
    expect(list.map((d) => d.item.id)).toEqual(['soon', 'later']);
  });

  it('includes a yearly date by its next occurrence', () => {
    const list = upcomingSpecialDates(
      [date('birthday', '1990-11-09', { repeat: 'yearly' })],
      now,
      30,
    );
    expect(list.map((d) => [d.item.id, d.status.days])).toEqual([['birthday', 3]]);
  });
});

describe('usStrip', () => {
  it('is empty with no dates', () => {
    expect(usStrip([], now, 30)).toEqual({ featured: null, next: null });
  });

  it('shows the running day count for a featured date in the past', () => {
    const strip = usStrip([date('together', '2026-01-01', { pinned: true })], now, 30);
    expect(strip.featured?.item.id).toBe('together');
    expect(strip.featured?.days).toBe(309);
    expect(strip.next).toBeNull();
  });

  it('has no running count for a featured date that is ahead or today', () => {
    expect(
      usStrip([date('wedding', '2027-01-01', { pinned: true })], now, 30).featured?.days,
    ).toBeNull();
    expect(
      usStrip([date('today', '2026-11-06', { pinned: true })], now, 30).featured?.days,
    ).toBeNull();
  });

  it('picks the next date other than the featured one', () => {
    const strip = usStrip(
      [
        date('together', '2026-01-01', { pinned: true }),
        date('birthday', '2026-11-10'),
        date('later', '2026-11-30'),
      ],
      now,
      30,
    );
    expect(strip.next?.item.id).toBe('birthday');
  });

  it('does not repeat the featured date as the next one', () => {
    const strip = usStrip(
      [date('anniversary', '2020-11-08', { repeat: 'yearly', pinned: true })],
      now,
      30,
    );
    expect(strip.featured?.item.id).toBe('anniversary');
    expect(strip.next).toBeNull();
  });

  it("leaves other people's dates and trips out of the strip", () => {
    const dates = [
      date('marta', '2026-11-08', {
        type: 'their_birthday',
        personName: 'Marta',
        repeat: 'yearly',
      }),
      date('lisbon', '2026-11-09', { type: 'trip' }),
      date('together', '2026-11-12', { type: 'first_day' }),
    ];
    expect(upcomingSpecialDates(dates, now, 30).map((d) => d.item.id)).toEqual(['together']);
    expect(usStrip(dates, now, 30).next?.item.id).toBe('together');
  });
});
