import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import { buildExternalPull } from '../calendar/pull';
import type { DbClient } from '../db';

// select().from(table).where(...) resolves to the fixture rows for that table.
function fakeDb(fixtures: Record<string, Array<Record<string, unknown>>>): DbClient {
  return {
    select: () => ({
      from: (table: object) => ({
        where: async () => fixtures[getTableName(table as any)] ?? [],
      }),
    }),
  } as unknown as DbClient;
}

const ME = 'user_me';
const PARTNER = 'user_partner';
const T = new Date('2026-11-02T00:00:00Z');

const calendar = (over: Record<string, unknown> = {}) => ({
  id: 'cal-p',
  userId: PARTNER,
  accountId: 'acc',
  googleCalendarId: 'primary',
  name: 'Therapy',
  color: '#123456',
  timeZone: 'Europe/Lisbon',
  accessRole: 'owner',
  syncEnabled: true,
  visibility: 'shared',
  confirmedAt: T,
  lastSyncedAt: T,
  lastError: null,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
  ...over,
});

const event = (over: Record<string, unknown> = {}) => ({
  id: 'ev1',
  calendarId: 'cal-p',
  userId: PARTNER,
  googleEventId: 'g1',
  icalUid: 'uid',
  title: 'Session with Dr X',
  description: 'Private notes',
  location: 'Clinic',
  startAt: new Date('2026-11-10T09:00:00Z'),
  endAt: new Date('2026-11-10T10:00:00Z'),
  startDate: null,
  endDate: null,
  isAllDay: false,
  status: 'confirmed',
  transparency: 'opaque',
  myResponse: 'accepted',
  googleVisibility: 'default',
  visibilityOverride: null,
  htmlLink: 'https://calendar.google.com/x',
  isRecurringInstance: false,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
  ...over,
});

const pull = (fixtures: Parameters<typeof fakeDb>[0]) =>
  buildExternalPull(fakeDb({ space_members: [{ userId: ME }, { userId: PARTNER }], ...fixtures }), {
    since: new Date(0),
    spaceId: 'space',
    viewerId: ME,
  });

describe('partner calendar data in the pull response', () => {
  it('delivers a shared partner event with details but without the Google link', async () => {
    const { externalEvents } = await pull({ external_calendars: [calendar()], external_events: [event()] });
    expect(externalEvents).toHaveLength(1);
    expect(externalEvents[0]).toMatchObject({ title: 'Session with Dr X', location: 'Clinic', redacted: false, htmlLink: null });
  });

  it('never sends a busy-only event\'s title, description or location', async () => {
    const { externalEvents } = await pull({
      external_calendars: [calendar({ visibility: 'busy_only' })],
      external_events: [event()],
    });
    const json = JSON.stringify(externalEvents[0]);
    expect(externalEvents[0]).toMatchObject({ title: null, description: null, location: null, redacted: true });
    expect(json).not.toContain('Dr X');
    expect(json).not.toContain('Private notes');
    expect(json).not.toContain('Clinic');
  });

  it('sends a private calendar\'s events as content-free tombstones', async () => {
    const { externalEvents } = await pull({
      external_calendars: [calendar({ visibility: 'private' })],
      external_events: [event()],
    });
    expect(externalEvents[0]!.deletedAt).not.toBeNull();
    expect(JSON.stringify(externalEvents[0])).not.toContain('Dr X');
  });

  it('applies a per-event override and Google\'s private flag', async () => {
    const overridden = await pull({
      external_calendars: [calendar()],
      external_events: [event({ visibilityOverride: 'private' })],
    });
    expect(overridden.externalEvents[0]!.deletedAt).not.toBeNull();

    const googlePrivate = await pull({
      external_calendars: [calendar()],
      external_events: [event({ googleVisibility: 'private' })],
    });
    expect(googlePrivate.externalEvents[0]).toMatchObject({ title: null, redacted: true });
  });

  it('hides declined invitations from the partner', async () => {
    const { externalEvents } = await pull({
      external_calendars: [calendar()],
      external_events: [event({ myResponse: 'declined' })],
    });
    expect(externalEvents[0]!.deletedAt).not.toBeNull();
  });

  it('hides everything of a disabled, deleted or unconfirmed calendar', async () => {
    for (const over of [{ syncEnabled: false }, { deletedAt: T }, { confirmedAt: null }]) {
      const { externalEvents } = await pull({ external_calendars: [calendar(over)], external_events: [event()] });
      expect(externalEvents[0]!.deletedAt).not.toBeNull();
      expect(externalEvents[0]!.title).toBeNull();
    }
  });

  it('gives the viewer their own events in full whatever the visibility', async () => {
    const mine = await pull({
      external_calendars: [calendar({ id: 'cal-m', userId: ME, visibility: 'private' })],
      external_events: [event({ calendarId: 'cal-m', userId: ME })],
    });
    expect(mine.externalEvents[0]).toMatchObject({ title: 'Session with Dr X', redacted: false, deletedAt: null });
  });

  it('keeps the name of a non-shared partner calendar to itself', async () => {
    const { externalCalendars } = await pull({
      external_calendars: [calendar({ visibility: 'busy_only' })],
      external_events: [],
    });
    expect(externalCalendars[0]!.name).toBeNull();
    expect(JSON.stringify(externalCalendars)).not.toContain('Therapy');
  });

  it('does not reveal a partner calendar that was never confirmed', async () => {
    const { externalCalendars } = await pull({
      external_calendars: [calendar({ confirmedAt: null })],
      external_events: [],
    });
    expect(externalCalendars).toHaveLength(0);
  });
});
