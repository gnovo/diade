/**
 * Runs the calendar store and service against a real Postgres. Skipped unless
 * TEST_DATABASE_URL points at a database with the migrations applied. It writes
 * rows, so use a scratch database:
 *
 *   TEST_DATABASE_URL=postgres://user:pass@localhost:54329/scratch pnpm --filter @diade/api test
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createDb, type DbClient } from '../db';
import { accounts, externalCalendars, externalEvents, spaceMembers, spaces, users } from '../db/schema';
import { createDrizzleEventStore } from './store';
import { buildExternalPull } from './pull';
import {
  confirmCalendars,
  disconnect,
  getConnection,
  refreshCalendarList,
  syncOneCalendar,
  setEventHighlight,
  updateCalendarSettings,
  updateEventOverride,
  type CalendarDeps,
} from './service';
import { mapGoogleEvent, type EventValues } from './mapper';
import type { GoogleEvent } from './google';

const url = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.TEST_DATABASE_URL;
const NOW = new Date('2026-11-05T12:00:00Z');
const LATER = new Date('2026-11-05T12:30:00Z');

const values = (id: string, summary = id, extra: Partial<GoogleEvent> = {}): EventValues => {
  const mapped = mapGoogleEvent({
    id,
    status: 'confirmed',
    summary,
    start: { dateTime: '2026-11-10T09:00:00Z' },
    end: { dateTime: '2026-11-10T10:00:00Z' },
    ...extra,
  });
  if (mapped.kind !== 'upsert') throw new Error('bad fixture');
  return mapped.values;
};

describe.skipIf(!url)('calendar sync against Postgres', () => {
  let db: DbClient;
  let deps: CalendarDeps;
  let store: ReturnType<typeof createDrizzleEventStore>;
  let calId: string;
  let partnerCalId: string;
  let spaceId: string;

  beforeAll(() => {
    db = createDb({ DATABASE_URL: url });
    store = createDrizzleEventStore(db);
    deps = { db, env: {}, now: () => NOW };
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE users, spaces CASCADE`);
    await db.insert(users).values([
      { id: 'me', email: 'me@x.com', name: 'Me' },
      { id: 'partner', email: 'p@x.com', name: 'Partner' },
    ]);
    await db.insert(accounts).values([
      { id: 'acc-me', userId: 'me', accountId: 'g-me', providerId: 'google', scope: 'openid,https://www.googleapis.com/auth/calendar.events.readonly,https://www.googleapis.com/auth/calendar.calendarlist.readonly', refreshToken: 'r' },
      { id: 'acc-p', userId: 'partner', accountId: 'g-p', providerId: 'google' },
    ]);
    const [space] = await db.insert(spaces).values({ name: 'Us', inviteCode: 'ABCDEFGH' }).returning();
    spaceId = space!.id;
    await db.insert(spaceMembers).values([
      { spaceId, userId: 'me' },
      { spaceId, userId: 'partner' },
    ]);
    const [mine] = await db
      .insert(externalCalendars)
      .values({ userId: 'me', accountId: 'acc-me', googleCalendarId: 'primary', name: 'Mine', confirmedAt: NOW })
      .returning();
    const [theirs] = await db
      .insert(externalCalendars)
      .values({ userId: 'partner', accountId: 'acc-p', googleCalendarId: 'primary', name: 'Theirs', confirmedAt: NOW })
      .returning();
    calId = mine!.id;
    partnerCalId = theirs!.id;
  });

  afterAll(async () => {
    await db?.execute(sql`TRUNCATE users, spaces CASCADE`);
  });

  const eventRow = async (googleId: string) =>
    (await db.select().from(externalEvents).where(eq(externalEvents.googleEventId, googleId)))[0];

  describe('store', () => {
    it('inserts events and lists them as live', async () => {
      await store.upsertEvents(calId, 'me', [values('a'), values('b')], NOW);
      expect((await store.listLiveGoogleIds(calId)).sort()).toEqual(['a', 'b']);
    });

    it('leaves updated_at alone when nothing changed, so devices do not re-download', async () => {
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      await store.upsertEvents(calId, 'me', [values('a')], LATER);
      expect((await eventRow('a'))!.updatedAt).toEqual(NOW);
    });

    it('bumps updated_at when content changes', async () => {
      await store.upsertEvents(calId, 'me', [values('a', 'Before')], NOW);
      await store.upsertEvents(calId, 'me', [values('a', 'After')], LATER);
      const row = (await eventRow('a'))!;
      expect(row.title).toBe('After');
      expect(row.updatedAt).toEqual(LATER);
    });

    it('stores all-day events as plain dates', async () => {
      await store.upsertEvents(calId, 'me', [values('d', 'Trip', { start: { date: '2026-11-10' }, end: { date: '2026-11-13' } })], NOW);
      const row = (await eventRow('d'))!;
      expect(row).toMatchObject({ isAllDay: true, startDate: '2026-11-10', endDate: '2026-11-12', startAt: null });
    });

    it('tombstones with blanked content, and restores on re-upsert', async () => {
      await store.upsertEvents(calId, 'me', [values('a', 'Secret')], NOW);
      await store.tombstoneByGoogleIds(calId, ['a'], LATER);
      const gone = (await eventRow('a'))!;
      expect(gone.deletedAt).toEqual(LATER);
      expect(gone.title).toBeNull();
      expect(await store.listLiveGoogleIds(calId)).toEqual([]);

      await store.upsertEvents(calId, 'me', [values('a', 'Secret')], LATER);
      const back = (await eventRow('a'))!;
      expect(back.deletedAt).toBeNull();
      expect(back.title).toBe('Secret');
    });

    it('keeps a visibility override when the event is updated from Google', async () => {
      await store.upsertEvents(calId, 'me', [values('a', 'Before')], NOW);
      await db.update(externalEvents).set({ visibilityOverride: 'private' }).where(eq(externalEvents.googleEventId, 'a'));
      await store.upsertEvents(calId, 'me', [values('a', 'After')], LATER);
      expect((await eventRow('a'))!.visibilityOverride).toBe('private');
    });
  });

  describe('settings', () => {
    it('tombstones events when a calendar is switched off and re-baselines when it is switched on', async () => {
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      await db.update(externalCalendars).set({ syncToken: 'T', lastFullSyncAt: NOW }).where(eq(externalCalendars.id, calId));

      await updateCalendarSettings(deps, 'me', calId, { syncEnabled: false });
      expect((await eventRow('a'))!.deletedAt).not.toBeNull();
      const off = (await db.select().from(externalCalendars).where(eq(externalCalendars.id, calId)))[0]!;
      expect(off).toMatchObject({ syncEnabled: false, syncToken: null, lastFullSyncAt: null });

      await updateCalendarSettings(deps, 'me', calId, { syncEnabled: true });
      expect((await db.select().from(externalCalendars).where(eq(externalCalendars.id, calId)))[0]!.syncToken).toBeNull();
    });

    it('refuses to change a calendar that belongs to the partner', async () => {
      expect(await updateCalendarSettings(deps, 'me', partnerCalId, { visibility: 'private' })).toBe('not_found');
      const row = (await db.select().from(externalCalendars).where(eq(externalCalendars.id, partnerCalId)))[0]!;
      expect(row.visibility).toBe('shared');
    });

    it('touches events when visibility changes so the partner receives the new version', async () => {
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      await updateCalendarSettings(deps, 'me', calId, { visibility: 'busy_only' });
      expect((await eventRow('a'))!.updatedAt).toEqual(NOW); // deps.now() is NOW; touch uses it
      const after = await buildExternalPull(db, { since: new Date('2026-11-05T11:59:00Z'), spaceId, viewerId: 'partner' });
      expect(after.externalEvents[0]).toMatchObject({ title: null, redacted: true });
    });

    it('forces free/busy-only calendars to stay busy-only', async () => {
      await db.update(externalCalendars).set({ accessRole: 'freeBusyReader' }).where(eq(externalCalendars.id, calId));
      await updateCalendarSettings(deps, 'me', calId, { visibility: 'shared' });
      expect((await db.select().from(externalCalendars).where(eq(externalCalendars.id, calId)))[0]!.visibility).toBe('busy_only');
    });

    it('applies the picker choices and confirms the rest', async () => {
      await db.update(externalCalendars).set({ confirmedAt: null }).where(eq(externalCalendars.id, calId));
      await confirmCalendars(deps, 'me', [{ id: calId, syncEnabled: true, visibility: 'busy_only' }]);
      const row = (await db.select().from(externalCalendars).where(eq(externalCalendars.id, calId)))[0]!;
      expect(row).toMatchObject({ visibility: 'busy_only', syncEnabled: true });
      expect(row.confirmedAt).not.toBeNull();
    });
  });

  describe('event overrides', () => {
    it('lets the owner narrow an event and clear the override', async () => {
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      const id = (await eventRow('a'))!.id;
      expect(await updateEventOverride(deps, 'me', id, 'private')).toBe('ok');
      expect((await eventRow('a'))!.visibilityOverride).toBe('private');
      expect(await updateEventOverride(deps, 'me', id, null)).toBe('ok');
      expect((await eventRow('a'))!.visibilityOverride).toBeNull();
    });

    it('refuses to make an event more visible than its calendar', async () => {
      await db.update(externalCalendars).set({ visibility: 'private' }).where(eq(externalCalendars.id, calId));
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      const id = (await eventRow('a'))!.id;
      expect(await updateEventOverride(deps, 'me', id, 'busy_only')).toBe('too_wide');
    });

    it('does not let a member touch the partner\'s events', async () => {
      await store.upsertEvents(partnerCalId, 'partner', [values('p1')], NOW);
      const id = (await eventRow('p1'))!.id;
      expect(await updateEventOverride(deps, 'me', id, 'private')).toBe('not_found');
    });
  });

  describe('event highlights', () => {
    it('lets the owner star and unstar an event', async () => {
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      const id = (await eventRow('a'))!.id;
      expect(await setEventHighlight(deps, 'me', id, true)).toBe('ok');
      expect((await eventRow('a'))!.highlighted).toBe(true);
      expect(await setEventHighlight(deps, 'me', id, false)).toBe('ok');
      expect((await eventRow('a'))!.highlighted).toBe(false);
    });

    it('does not let a member star the partner\'s event', async () => {
      await store.upsertEvents(partnerCalId, 'partner', [values('p1')], NOW);
      const id = (await eventRow('p1'))!.id;
      expect(await setEventHighlight(deps, 'me', id, true)).toBe('not_found');
      expect((await eventRow('p1'))!.highlighted).toBe(false);
    });

    it('survives a re-sync of the event from Google', async () => {
      await store.upsertEvents(calId, 'me', [values('a', 'Before')], NOW);
      await setEventHighlight(deps, 'me', (await eventRow('a'))!.id, true);
      await store.upsertEvents(calId, 'me', [values('a', 'After')], LATER);
      expect((await eventRow('a'))!).toMatchObject({ title: 'After', highlighted: true });
    });

    it('bumps updated_at, so the partner\'s device downloads the change', async () => {
      await store.upsertEvents(calId, 'me', [values('a')], NOW);
      await setEventHighlight({ ...deps, now: () => LATER }, 'me', (await eventRow('a'))!.id, true);
      expect((await eventRow('a'))!.updatedAt).toEqual(LATER);
    });

    it('reaches the partner for a shared event, but not for a busy-only one', async () => {
      await store.upsertEvents(calId, 'me', [values('a', 'Dinner')], NOW);
      await setEventHighlight(deps, 'me', (await eventRow('a'))!.id, true);

      const shared = await buildExternalPull(db, { since: new Date(0), spaceId, viewerId: 'partner' });
      expect(shared.externalEvents.find((e) => e.googleEventId === 'a')).toMatchObject({ title: 'Dinner', highlighted: true });

      await db.update(externalCalendars).set({ visibility: 'busy_only' }).where(eq(externalCalendars.id, calId));
      const busy = await buildExternalPull(db, { since: new Date(0), spaceId, viewerId: 'partner' });
      expect(busy.externalEvents.find((e) => e.googleEventId === 'a')).toMatchObject({ title: null, highlighted: false });

      const owner = await buildExternalPull(db, { since: new Date(0), spaceId, viewerId: 'me' });
      expect(owner.externalEvents.find((e) => e.googleEventId === 'a')).toMatchObject({ highlighted: true });
    });
  });

  describe('pull', () => {
    it('returns own events in full and partner events redacted, scoped by cursor', async () => {
      await store.upsertEvents(calId, 'me', [values('mine', 'My dentist')], NOW);
      await store.upsertEvents(partnerCalId, 'partner', [values('theirs', 'Their therapy')], NOW);
      await db.update(externalCalendars).set({ visibility: 'busy_only' }).where(eq(externalCalendars.id, partnerCalId));

      const pull = await buildExternalPull(db, { since: new Date(0), spaceId, viewerId: 'me' });
      const byTitle = Object.fromEntries(pull.externalEvents.map((e) => [e.googleEventId, e]));
      expect(byTitle.mine).toMatchObject({ title: 'My dentist', redacted: false });
      expect(byTitle.theirs).toMatchObject({ title: null, redacted: true });
      expect(JSON.stringify(pull)).not.toContain('Their therapy');

      const none = await buildExternalPull(db, { since: new Date('2026-11-06T00:00:00Z'), spaceId, viewerId: 'me' });
      expect(none.externalEvents).toHaveLength(0);
    });
  });

  describe('sync lease', () => {
    it('skips a calendar that another run holds, and releases the lease on failure', async () => {
      const [calendar] = await db.select().from(externalCalendars).where(eq(externalCalendars.id, calId));
      await db.update(externalCalendars).set({ lockUntil: new Date(NOW.getTime() + 60_000) }).where(eq(externalCalendars.id, calId));
      expect((await syncOneCalendar(deps, calendar!)).status).toBe('skipped');

      await db.update(externalCalendars).set({ lockUntil: null }).where(eq(externalCalendars.id, calId));
      // No Google credentials in this environment, so the sync fails and must record it cleanly.
      const failed = await syncOneCalendar(deps, calendar!);
      expect(failed.status).toBe('error');
      const row = (await db.select().from(externalCalendars).where(eq(externalCalendars.id, calId)))[0]!;
      expect(row.lockUntil).toBeNull();
      expect(row.lastError).toBe('sync_failed');
    });
  });

  describe('disconnect', () => {
    it('removes the member\'s calendars and events as tombstones and strips the calendar scopes', async () => {
      await store.upsertEvents(calId, 'me', [values('a', 'Secret')], NOW);
      await disconnect(deps, 'me');

      expect((await eventRow('a'))!).toMatchObject({ title: null });
      expect((await eventRow('a'))!.deletedAt).not.toBeNull();
      const connection = await getConnection(db, 'me');
      expect(connection.calendars).toHaveLength(0);
      expect(connection.connected).toBe(false);
      const [account] = await db.select().from(accounts).where(eq(accounts.id, 'acc-me'));
      expect(account!.scope).toBe('openid');
      expect(account!.refreshToken).toBeNull();
    });

    it('restores calendars after a reconnect following Google\'s selected flag, not switched off', async () => {
      await disconnect(deps, 'me');
      const fetchFn = async (input: string) =>
        input.includes('calendarList')
          ? new Response(JSON.stringify({ items: [{ id: 'primary', summary: 'Mine', accessRole: 'owner', selected: true }, { id: 'holidays', summary: 'Holidays', accessRole: 'reader' }] }), { status: 200 })
          : new Response('{}', { status: 200 });
      await db.update(accounts).set({
        scope: 'openid,https://www.googleapis.com/auth/calendar.events.readonly,https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        refreshToken: 'plain-refresh', accessToken: 'plain-access', accessTokenExpiresAt: new Date(NOW.getTime() + 3_600_000),
      }).where(eq(accounts.id, 'acc-me'));

      await refreshCalendarList({ ...deps, env: { BETTER_AUTH_SECRET: 'x'.repeat(32) }, fetchFn }, 'me');
      const connection = await getConnection(db, 'me');
      const byName = Object.fromEntries(connection.calendars.map((c) => [c.name, c]));
      expect(byName.Mine).toMatchObject({ syncEnabled: true, visibility: 'shared', confirmedAt: null });
      expect(byName.Holidays).toMatchObject({ syncEnabled: false });
      expect(connection.confirmed).toBe(false);
    });

    it('starts calendars that appear after the first confirmation switched off', async () => {
      const fetchFn = async (input: string) =>
        input.includes('calendarList')
          ? new Response(JSON.stringify({ items: [{ id: 'primary', summary: 'Mine', accessRole: 'owner', selected: true }, { id: 'new-cal', summary: 'New one', accessRole: 'owner', selected: true }] }), { status: 200 })
          : new Response('{}', { status: 200 });
      await db.update(accounts).set({ accessToken: 'plain-access', accessTokenExpiresAt: new Date(NOW.getTime() + 3_600_000) }).where(eq(accounts.id, 'acc-me'));

      await refreshCalendarList({ ...deps, env: { BETTER_AUTH_SECRET: 'x'.repeat(32) }, fetchFn }, 'me');
      const added = (await getConnection(db, 'me')).calendars.find((c) => c.name === 'New one');
      expect(added).toMatchObject({ syncEnabled: false, visibility: 'shared' });
      expect(added!.confirmedAt).not.toBeNull();
    });

    it('leaves the partner\'s data alone', async () => {
      await store.upsertEvents(partnerCalId, 'partner', [values('p1')], NOW);
      await disconnect(deps, 'me');
      expect((await eventRow('p1'))!.deletedAt).toBeNull();
    });
  });
});
