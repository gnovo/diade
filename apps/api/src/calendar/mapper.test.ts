import { describe, expect, it } from 'vitest';
import type { GoogleEvent } from './google';
import { inclusiveEndDate, mapGoogleCalendar, mapGoogleEvent } from './mapper';

const timed = (over: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: 'ev1',
  status: 'confirmed',
  summary: 'Dentist',
  start: { dateTime: '2026-11-10T09:00:00+01:00' },
  end: { dateTime: '2026-11-10T10:00:00+01:00' },
  ...over,
});

const upsert = (event: GoogleEvent) => {
  const mapped = mapGoogleEvent(event);
  if (mapped.kind !== 'upsert') throw new Error(`expected upsert, got ${mapped.kind}`);
  return mapped.values;
};

describe('mapGoogleEvent', () => {
  it('maps a timed event to UTC instants', () => {
    const v = upsert(timed());
    expect(v.isAllDay).toBe(false);
    expect(v.startAt?.toISOString()).toBe('2026-11-10T08:00:00.000Z');
    expect(v.endAt?.toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(v.startDate).toBeNull();
  });

  it('keeps wall-clock correctness across a DST change', () => {
    // Lisbon leaves summer time on 2026-10-25: 00:30 is +01:00 and 03:00 is +00:00.
    const v = upsert(
      timed({
        start: { dateTime: '2026-10-25T00:30:00+01:00' },
        end: { dateTime: '2026-10-25T03:00:00+00:00' },
      }),
    );
    expect(v.startAt?.toISOString()).toBe('2026-10-24T23:30:00.000Z');
    expect(v.endAt?.toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('maps an all-day event to plain dates with an inclusive end', () => {
    const v = upsert(timed({ start: { date: '2026-11-10' }, end: { date: '2026-11-13' } }));
    expect(v.isAllDay).toBe(true);
    expect(v.startDate).toBe('2026-11-10');
    expect(v.endDate).toBe('2026-11-12');
    expect(v.startAt).toBeNull();
  });

  it('collapses a one-day all-day event to the same start and end date', () => {
    const v = upsert(timed({ start: { date: '2026-11-10' }, end: { date: '2026-11-11' } }));
    expect(v.endDate).toBe('2026-11-10');
  });

  it('handles month and year boundaries in the exclusive end', () => {
    expect(inclusiveEndDate('2026-12-30', '2027-01-01')).toBe('2026-12-31');
    expect(inclusiveEndDate('2026-02-27', '2026-03-01')).toBe('2026-02-28');
  });

  it('never lets the end fall before the start', () => {
    expect(inclusiveEndDate('2026-11-10', '2026-11-10')).toBe('2026-11-10');
  });

  it('reports cancelled events as removals', () => {
    expect(mapGoogleEvent({ id: 'gone', status: 'cancelled' })).toEqual({
      kind: 'cancelled',
      googleEventId: 'gone',
    });
  });

  it('marks tentative events', () => {
    expect(upsert(timed({ status: 'tentative' })).status).toBe('tentative');
  });

  it('tolerates a missing title', () => {
    expect(upsert(timed({ summary: undefined })).title).toBeNull();
  });

  it('reads the owner response from the self attendee', () => {
    const v = upsert(
      timed({
        attendees: [{ responseStatus: 'accepted' }, { self: true, responseStatus: 'declined' }],
      }),
    );
    expect(v.myResponse).toBe('declined');
    expect(upsert(timed()).myResponse).toBeNull();
  });

  it('treats events without transparency as busy and reads free events', () => {
    expect(upsert(timed()).transparency).toBe('opaque');
    expect(upsert(timed({ transparency: 'transparent' })).transparency).toBe('transparent');
  });

  it('keeps recurring instances identifiable and carries Google visibility', () => {
    const v = upsert(
      timed({ recurringEventId: 'series', visibility: 'private', iCalUID: 'u@google.com' }),
    );
    expect(v.isRecurringInstance).toBe(true);
    expect(v.googleVisibility).toBe('private');
    expect(v.icalUid).toBe('u@google.com');
  });

  it('skips working-location entries and events without times', () => {
    expect(mapGoogleEvent(timed({ eventType: 'workingLocation' })).kind).toBe('skip');
    expect(mapGoogleEvent({ id: 'x', status: 'confirmed' }).kind).toBe('skip');
    expect(mapGoogleEvent(timed({ start: { dateTime: 'not-a-date' } })).kind).toBe('skip');
  });
});

describe('mapGoogleCalendar', () => {
  it("prefers the member's own name for a calendar and follows Google's selected flag", () => {
    const c = mapGoogleCalendar({
      id: 'cal@group',
      summary: 'Family',
      summaryOverride: 'Us',
      backgroundColor: '#0b8043',
      accessRole: 'writer',
      selected: true,
    });
    expect(c).toMatchObject({ name: 'Us', color: '#0b8043', accessRole: 'writer', selected: true });
  });

  it('treats a missing selected flag as hidden and ignores unknown roles', () => {
    const c = mapGoogleCalendar({ id: 'h', summary: 'Holidays', accessRole: 'mystery' });
    expect(c?.selected).toBe(false);
    expect(c?.accessRole).toBeNull();
  });

  it('drops deleted calendars', () => {
    expect(mapGoogleCalendar({ id: 'd', deleted: true })).toBeNull();
  });
});
