/**
 * Database-backed calendar sync: connection state, the calendar list, per-calendar sync with
 * a lease, and disconnect. Routes and the cron handler call into here.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { GOOGLE_CALENDAR_SCOPES, isNarrowerOrEqual, type ExternalVisibility } from '@diade/domain';
import type { DbClient } from '../db';
import { accounts, externalCalendars, externalEvents } from '../db/schema';
import { syncCalendarEvents, type SyncTarget } from './engine';
import {
  GoogleApiError,
  GoogleAuthError,
  createGoogleClient,
  revokeGoogleToken,
  type FetchFn,
  type GoogleClient,
} from './google';
import { mapGoogleCalendar } from './mapper';
import { createDrizzleEventStore } from './store';
import { decryptToken, getGoogleAccessToken, hasScopes, parseScopes, type TokenEnv } from './tokens';

export interface CalendarDeps {
  db: DbClient;
  env: TokenEnv;
  fetchFn?: FetchFn;
  now?: () => Date;
}

/** Values stored in `external_calendars.last_error`. Never contain event content. */
export const SYNC_ERRORS = {
  needsReauth: 'needs_reauth',
  rateLimited: 'rate_limited',
  failed: 'sync_failed',
} as const;

const LEASE_MS = 2 * 60_000;
/** A calendar synced this recently is skipped by on-demand syncs. */
export const MIN_SYNC_INTERVAL_MS = 60_000;
/** Calendars handled per cron run, so a single invocation stays well inside Worker limits. */
export const CRON_CALENDAR_BATCH = 20;

const nowOf = (deps: CalendarDeps) => (deps.now ? deps.now() : new Date());

async function googleAccountOf(db: DbClient, userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);
  return account ?? null;
}

export function accountHasCalendarAccess(
  account: { scope: string | null; refreshToken: string | null } | null,
): boolean {
  return Boolean(account?.refreshToken && hasScopes(account.scope, GOOGLE_CALENDAR_SCOPES));
}

function clientFor(deps: CalendarDeps, accountId: string): GoogleClient {
  return createGoogleClient(
    (force) => getGoogleAccessToken(deps.db, deps.env, accountId, { forceRefresh: force, fetchFn: deps.fetchFn, now: nowOf(deps) }),
    deps.fetchFn,
  );
}

// --- Connection state ---

export interface ConnectionState {
  connected: boolean;
  needsReauth: boolean;
  /** True once the member has seen and confirmed the calendar picker. */
  confirmed: boolean;
  calendars: Array<typeof externalCalendars.$inferSelect>;
}

export async function getConnection(db: DbClient, userId: string): Promise<ConnectionState> {
  const account = await googleAccountOf(db, userId);
  const calendars = await db
    .select()
    .from(externalCalendars)
    .where(and(eq(externalCalendars.userId, userId), isNull(externalCalendars.deletedAt)))
    .orderBy(asc(externalCalendars.name));

  const connected = accountHasCalendarAccess(account);
  const needsReauth = calendars.some((c) => c.lastError === SYNC_ERRORS.needsReauth) ||
    (calendars.length > 0 && !connected);
  return {
    connected,
    needsReauth,
    confirmed: calendars.some((c) => c.confirmedAt !== null),
    calendars,
  };
}

// --- Calendar list ---

/**
 * Reads the member's calendar list from Google and reconciles it with ours. Calendars
 * found for the first time before the member confirmed the picker follow Google's own
 * "selected" flag. Calendars that appear later start switched off, so a new Google calendar
 * is never shared by surprise.
 */
export async function refreshCalendarList(deps: CalendarDeps, userId: string): Promise<void> {
  const { db } = deps;
  const account = await googleAccountOf(db, userId);
  if (!account || !accountHasCalendarAccess(account)) throw new GoogleAuthError('Calendar access not granted');

  const now = nowOf(deps);
  const entries = (await clientFor(deps, account.id).listCalendars())
    .map(mapGoogleCalendar)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const existing = await db.select().from(externalCalendars).where(eq(externalCalendars.userId, userId));
  const byGoogleId = new Map(existing.map((c) => [c.googleCalendarId, c]));
  const alreadyConfirmed = existing.some((c) => c.confirmedAt !== null);
  const seen = new Set<string>();

  for (const entry of entries) {
    seen.add(entry.googleCalendarId);
    const current = byGoogleId.get(entry.googleCalendarId);
    const freeBusyOnly = entry.accessRole === 'freeBusyReader';

    if (!current) {
      await db.insert(externalCalendars).values({
        userId,
        accountId: account.id,
        googleCalendarId: entry.googleCalendarId,
        name: entry.name,
        color: entry.color,
        timeZone: entry.timeZone,
        accessRole: entry.accessRole,
        syncEnabled: alreadyConfirmed ? false : entry.selected,
        visibility: freeBusyOnly ? 'busy_only' : 'shared',
        confirmedAt: alreadyConfirmed ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    const changed =
      current.name !== entry.name ||
      current.color !== entry.color ||
      current.timeZone !== entry.timeZone ||
      current.accessRole !== entry.accessRole ||
      current.deletedAt !== null;
    if (changed) {
      await db
        .update(externalCalendars)
        .set({
          name: entry.name,
          color: entry.color,
          timeZone: entry.timeZone,
          accessRole: entry.accessRole,
          deletedAt: null,
          // A calendar that comes back (after a disconnect, or because it vanished from Google
          // for a while) starts afresh: it follows Google's "selected" flag until the member has
          // confirmed the picker, and is switched off afterwards so nothing is shared by surprise.
          ...(current.deletedAt
            ? {
                syncEnabled: alreadyConfirmed ? false : entry.selected,
                visibility: freeBusyOnly ? 'busy_only' : 'shared',
                confirmedAt: alreadyConfirmed ? now : null,
                syncToken: null,
              }
            : {}),
          updatedAt: now,
        })
        .where(eq(externalCalendars.id, current.id));
    }
  }

  const removed = existing.filter((c) => !seen.has(c.googleCalendarId) && c.deletedAt === null);
  for (const calendar of removed) await retireCalendar(db, calendar.id, now);
}

/** Switches a calendar off and tombstones its events so the partner's device drops them. */
async function retireCalendar(db: DbClient, calendarId: string, now: Date, deleted = true): Promise<void> {
  await tombstoneCalendarEvents(db, calendarId, now);
  await db
    .update(externalCalendars)
    .set({
      syncEnabled: false,
      syncToken: null,
      windowStart: null,
      windowEnd: null,
      lastFullSyncAt: null,
      ...(deleted ? { deletedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(externalCalendars.id, calendarId));
}

async function tombstoneCalendarEvents(db: DbClient, calendarId: string, now: Date): Promise<void> {
  await db
    .update(externalEvents)
    .set({ deletedAt: now, updatedAt: now, title: null, description: null, location: null, htmlLink: null })
    .where(and(eq(externalEvents.calendarId, calendarId), isNull(externalEvents.deletedAt)));
}

// --- Settings changes ---

export async function updateCalendarSettings(
  deps: CalendarDeps,
  userId: string,
  calendarId: string,
  changes: { syncEnabled?: boolean; visibility?: ExternalVisibility },
): Promise<'ok' | 'not_found'> {
  const { db } = deps;
  const now = nowOf(deps);
  const [calendar] = await db
    .select()
    .from(externalCalendars)
    .where(and(eq(externalCalendars.id, calendarId), eq(externalCalendars.userId, userId), isNull(externalCalendars.deletedAt)))
    .limit(1);
  if (!calendar) return 'not_found';

  // Free/busy-only calendars can never be shared in full.
  const visibility =
    changes.visibility && calendar.accessRole === 'freeBusyReader' && changes.visibility === 'shared'
      ? 'busy_only'
      : changes.visibility;

  if (changes.syncEnabled === false && calendar.syncEnabled) {
    await tombstoneCalendarEvents(db, calendar.id, now);
  }

  await db
    .update(externalCalendars)
    .set({
      ...(changes.syncEnabled !== undefined ? { syncEnabled: changes.syncEnabled } : {}),
      ...(visibility ? { visibility } : {}),
      // Re-enabling needs a full sync to restore the events tombstoned when it was switched off.
      ...(changes.syncEnabled === false || (changes.syncEnabled === true && !calendar.syncEnabled)
        ? { syncToken: null, lastFullSyncAt: null, windowEnd: null }
        : {}),
      confirmedAt: calendar.confirmedAt ?? now,
      updatedAt: now,
    })
    .where(eq(externalCalendars.id, calendar.id));

  // A visibility change must reach the partner: touch the events so their next pull
  // receives the narrower (or wider) version, or a tombstone.
  if (visibility && visibility !== calendar.visibility) {
    await db.update(externalEvents).set({ updatedAt: now }).where(eq(externalEvents.calendarId, calendar.id));
  }
  return 'ok';
}

/** First-run confirmation: applies the picker's choices and starts syncing. */
export async function confirmCalendars(
  deps: CalendarDeps,
  userId: string,
  choices: Array<{ id: string; syncEnabled: boolean; visibility: ExternalVisibility }>,
): Promise<void> {
  for (const choice of choices) {
    await updateCalendarSettings(deps, userId, choice.id, {
      syncEnabled: choice.syncEnabled,
      visibility: choice.visibility,
    });
  }
  // Calendars the picker did not list are confirmed with their current settings.
  await deps.db
    .update(externalCalendars)
    .set({ confirmedAt: nowOf(deps) })
    .where(and(eq(externalCalendars.userId, userId), isNull(externalCalendars.confirmedAt)));
}

/**
 * Sets or clears the per-event override. It may only narrow the calendar's visibility,
 * so a "private" calendar cannot have one event made public.
 */
export async function updateEventOverride(
  deps: CalendarDeps,
  userId: string,
  eventId: string,
  override: 'busy_only' | 'private' | null,
): Promise<'ok' | 'not_found' | 'too_wide'> {
  const { db } = deps;
  const [row] = await db
    .select({ event: externalEvents, calendarVisibility: externalCalendars.visibility })
    .from(externalEvents)
    .innerJoin(externalCalendars, eq(externalEvents.calendarId, externalCalendars.id))
    .where(and(eq(externalEvents.id, eventId), eq(externalEvents.userId, userId), isNull(externalEvents.deletedAt)))
    .limit(1);
  if (!row) return 'not_found';
  if (override && !isNarrowerOrEqual(override, row.calendarVisibility as ExternalVisibility)) return 'too_wide';

  await db
    .update(externalEvents)
    .set({ visibilityOverride: override, updatedAt: nowOf(deps) })
    .where(eq(externalEvents.id, eventId));
  return 'ok';
}

/** Stars or unstars one of the member's own events. */
export async function setEventHighlight(
  deps: CalendarDeps,
  userId: string,
  eventId: string,
  highlighted: boolean,
): Promise<'ok' | 'not_found'> {
  const updated = await deps.db
    .update(externalEvents)
    .set({ highlighted, updatedAt: nowOf(deps) })
    .where(and(eq(externalEvents.id, eventId), eq(externalEvents.userId, userId), isNull(externalEvents.deletedAt)))
    .returning({ id: externalEvents.id });
  return updated.length > 0 ? 'ok' : 'not_found';
}

// --- Sync ---

export interface CalendarSyncOutcome {
  calendarId: string;
  status: 'synced' | 'skipped' | 'error';
  error?: string;
  mode?: 'full' | 'incremental';
}

function errorCode(err: unknown): string {
  if (err instanceof GoogleAuthError) return SYNC_ERRORS.needsReauth;
  if (err instanceof GoogleApiError && err.isRateLimited) return SYNC_ERRORS.rateLimited;
  return SYNC_ERRORS.failed;
}

export async function syncOneCalendar(
  deps: CalendarDeps,
  calendar: typeof externalCalendars.$inferSelect,
  options: { forceFull?: boolean } = {},
): Promise<CalendarSyncOutcome> {
  const { db } = deps;
  const now = nowOf(deps);

  // Take the lease. If another run holds it, skip rather than wait.
  const leased = await db
    .update(externalCalendars)
    .set({ lockUntil: new Date(now.getTime() + LEASE_MS) })
    .where(
      and(
        eq(externalCalendars.id, calendar.id),
        or(isNull(externalCalendars.lockUntil), lt(externalCalendars.lockUntil, now)),
      ),
    )
    .returning({ id: externalCalendars.id });
  if (leased.length === 0) return { calendarId: calendar.id, status: 'skipped' };

  try {
    const target: SyncTarget = {
      id: calendar.id,
      userId: calendar.userId,
      googleCalendarId: calendar.googleCalendarId,
      syncToken: calendar.syncToken,
      windowStart: calendar.windowStart,
      windowEnd: calendar.windowEnd,
      lastFullSyncAt: calendar.lastFullSyncAt,
    };
    const result = await syncCalendarEvents(
      { google: clientFor(deps, calendar.accountId), store: createDrizzleEventStore(db) },
      target,
      now,
      options,
    );
    await db
      .update(externalCalendars)
      .set({
        syncToken: result.state.syncToken,
        windowStart: result.state.windowStart,
        windowEnd: result.state.windowEnd,
        lastFullSyncAt: result.state.lastFullSyncAt,
        lastSyncedAt: now,
        lastError: null,
        lockUntil: null,
      })
      .where(eq(externalCalendars.id, calendar.id));
    return { calendarId: calendar.id, status: 'synced', mode: result.mode };
  } catch (err) {
    const code = errorCode(err);
    console.error('[calendar] sync failed', calendar.id, code, err instanceof Error ? err.name : 'error');
    await db
      .update(externalCalendars)
      .set({ lastError: code, lockUntil: null })
      .where(eq(externalCalendars.id, calendar.id));
    return { calendarId: calendar.id, status: 'error', error: code };
  }
}

const syncable = and(
  eq(externalCalendars.syncEnabled, true),
  isNull(externalCalendars.deletedAt),
  isNotNull(externalCalendars.confirmedAt),
);

/** On-demand sync of one member's calendars. Skips calendars synced in the last minute. */
export async function syncUserCalendars(
  deps: CalendarDeps,
  userId: string,
  options: { force?: boolean } = {},
): Promise<CalendarSyncOutcome[]> {
  const now = nowOf(deps);
  const calendars = await deps.db
    .select()
    .from(externalCalendars)
    .where(and(eq(externalCalendars.userId, userId), syncable))
    .orderBy(asc(externalCalendars.lastSyncedAt));

  const outcomes: CalendarSyncOutcome[] = [];
  for (const calendar of calendars) {
    const recent =
      calendar.lastSyncedAt && now.getTime() - calendar.lastSyncedAt.getTime() < MIN_SYNC_INTERVAL_MS;
    if (recent && !options.force) {
      outcomes.push({ calendarId: calendar.id, status: 'skipped' });
      continue;
    }
    outcomes.push(await syncOneCalendar(deps, calendar));
    // The member must reconnect; the remaining calendars of the same account would fail too.
    if (outcomes[outcomes.length - 1]?.error === SYNC_ERRORS.needsReauth) break;
  }
  return outcomes;
}

/** Cron entry point: the stalest calendars first, a bounded batch per run. */
export async function syncDueCalendars(deps: CalendarDeps): Promise<CalendarSyncOutcome[]> {
  const calendars = await deps.db
    .select()
    .from(externalCalendars)
    .where(syncable)
    .orderBy(sql`${externalCalendars.lastSyncedAt} ASC NULLS FIRST`)
    .limit(CRON_CALENDAR_BATCH);

  // Pick up calendars added in Google since the last run (they start switched off).
  const userIds = [...new Set(calendars.map((c) => c.userId))];
  for (const userId of userIds) {
    await refreshCalendarList(deps, userId).catch((err) =>
      console.warn('[calendar] list refresh failed', err instanceof Error ? err.name : 'error'),
    );
  }

  const outcomes: CalendarSyncOutcome[] = [];
  const blockedAccounts = new Set<string>();
  for (const calendar of calendars) {
    if (blockedAccounts.has(calendar.accountId)) continue;
    const outcome = await syncOneCalendar(deps, calendar);
    outcomes.push(outcome);
    if (outcome.error === SYNC_ERRORS.needsReauth) blockedAccounts.add(calendar.accountId);
  }
  return outcomes;
}

// --- Disconnect ---

/**
 * Removes every synced calendar and event of the member (as tombstones, so the partner's
 * device drops them), revokes the Google token and strips the calendar scopes from the
 * account. Signing in with Google keeps working.
 */
export async function disconnect(deps: CalendarDeps, userId: string): Promise<void> {
  const { db } = deps;
  const now = nowOf(deps);
  const account = await googleAccountOf(db, userId);

  const calendars = await db.select({ id: externalCalendars.id }).from(externalCalendars).where(eq(externalCalendars.userId, userId));
  if (calendars.length > 0) {
    const ids = calendars.map((c) => c.id);
    await db
      .update(externalEvents)
      .set({ deletedAt: now, updatedAt: now, title: null, description: null, location: null, htmlLink: null })
      .where(and(inArray(externalEvents.calendarId, ids), isNull(externalEvents.deletedAt)));
    await db
      .update(externalCalendars)
      .set({
        syncEnabled: false,
        syncToken: null,
        windowStart: null,
        windowEnd: null,
        lastFullSyncAt: null,
        lastError: null,
        lockUntil: null,
        confirmedAt: null,
        deletedAt: now,
        updatedAt: now,
      })
      .where(inArray(externalCalendars.id, ids));
  }

  if (account) {
    // Revoke first (needs the token), best effort.
    if (deps.env.BETTER_AUTH_SECRET && account.refreshToken) {
      const token = await decryptToken(account.refreshToken, deps.env.BETTER_AUTH_SECRET).catch(() => null);
      if (token) await revokeGoogleToken(token, deps.fetchFn).catch(() => undefined);
    }
    const remaining = parseScopes(account.scope).filter(
      (s) => !(GOOGLE_CALENDAR_SCOPES as readonly string[]).includes(s),
    );
    await db
      .update(accounts)
      .set({
        scope: remaining.join(','),
        // Revoking the grant invalidates these tokens too.
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(accounts.id, account.id));
  }
}
