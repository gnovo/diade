/**
 * Per-calendar event sync. Talks to Google through `GoogleClient` and to storage through
 * `EventStore`, so the whole policy (full vs incremental, 410 recovery, window roll-forward,
 * tombstoning) is testable without a network or a database.
 */
import { GoogleApiError, type GoogleClient } from './google';
import { mapGoogleEvent, type EventValues } from './mapper';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A full sync covers this much of the past and future. */
export const WINDOW_PAST_DAYS = 30;
export const WINDOW_FUTURE_DAYS = 365;
/** Re-baseline when less than this much of the future window is left. */
export const WINDOW_REBASE_DAYS = 60;
/** Re-baseline at least this often, which also catches anything incremental sync missed. */
export const FULL_SYNC_MAX_AGE_DAYS = 7;

export interface EventStore {
  /** Inserts or updates rows. Rows whose content did not change must keep their `updatedAt`. */
  upsertEvents(calendarId: string, userId: string, rows: EventValues[], now: Date): Promise<void>;
  /** Soft-deletes the events with these Google ids. */
  tombstoneByGoogleIds(calendarId: string, googleEventIds: string[], now: Date): Promise<void>;
  /** Google ids of the calendar's events that are not deleted. */
  listLiveGoogleIds(calendarId: string): Promise<string[]>;
}

export interface SyncState {
  syncToken: string | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  lastFullSyncAt: Date | null;
}

export interface SyncTarget extends SyncState {
  id: string;
  userId: string;
  googleCalendarId: string;
}

export interface SyncResult {
  mode: 'full' | 'incremental';
  state: SyncState;
  upserted: number;
  removed: number;
}

export function needsFullSync(state: SyncState, now: Date): boolean {
  if (!state.syncToken || !state.windowEnd || !state.lastFullSyncAt) return true;
  if (state.windowEnd.getTime() - now.getTime() < WINDOW_REBASE_DAYS * DAY_MS) return true;
  return now.getTime() - state.lastFullSyncAt.getTime() > FULL_SYNC_MAX_AGE_DAYS * DAY_MS;
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function syncCalendarEvents(
  deps: { google: GoogleClient; store: EventStore },
  calendar: SyncTarget,
  now: Date,
  options: { forceFull?: boolean } = {},
): Promise<SyncResult> {
  const full = options.forceFull || needsFullSync(calendar, now);
  if (!full) {
    try {
      return await runIncremental(deps, calendar, now);
    } catch (err) {
      // 410 Gone: the sync token expired. Fall through to a full sync in the same call.
      if (!(err instanceof GoogleApiError && err.isGone)) throw err;
    }
  }
  return runFull(deps, calendar, now);
}

async function runIncremental(
  { google, store }: { google: GoogleClient; store: EventStore },
  calendar: SyncTarget,
  now: Date,
): Promise<SyncResult> {
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const upserts = new Map<string, EventValues>();
  const removals = new Set<string>();

  do {
    const page = await google.listEvents(calendar.googleCalendarId, {
      syncToken: calendar.syncToken!,
      pageToken,
    });
    for (const item of page.items) {
      const mapped = mapGoogleEvent(item);
      if (mapped.kind === 'upsert') {
        upserts.set(mapped.values.googleEventId, mapped.values);
        removals.delete(mapped.values.googleEventId);
      } else if (mapped.kind === 'cancelled') {
        removals.add(mapped.googleEventId);
        upserts.delete(mapped.googleEventId);
      }
    }
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  // Only write once every page was read, so a failure part-way leaves the old token valid.
  await store.upsertEvents(calendar.id, calendar.userId, [...upserts.values()], now);
  await store.tombstoneByGoogleIds(calendar.id, [...removals], now);

  return {
    mode: 'incremental',
    upserted: upserts.size,
    removed: removals.size,
    state: {
      syncToken: nextSyncToken ?? calendar.syncToken,
      windowStart: calendar.windowStart,
      windowEnd: calendar.windowEnd,
      lastFullSyncAt: calendar.lastFullSyncAt,
    },
  };
}

async function runFull(
  { google, store }: { google: GoogleClient; store: EventStore },
  calendar: SyncTarget,
  now: Date,
): Promise<SyncResult> {
  const windowStart = new Date(now.getTime() - WINDOW_PAST_DAYS * DAY_MS);
  const windowEnd = new Date(now.getTime() + WINDOW_FUTURE_DAYS * DAY_MS);

  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  const seen = new Map<string, EventValues>();

  do {
    const page = await google.listEvents(calendar.googleCalendarId, {
      timeMin: windowStart,
      timeMax: windowEnd,
      pageToken,
    });
    for (const item of page.items) {
      const mapped = mapGoogleEvent(item);
      if (mapped.kind === 'upsert') seen.set(mapped.values.googleEventId, mapped.values);
    }
    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  await store.upsertEvents(calendar.id, calendar.userId, [...seen.values()], now);

  // Anything stored but not returned was deleted or moved out of the window.
  const live = await store.listLiveGoogleIds(calendar.id);
  const gone = live.filter((id) => !seen.has(id));
  for (const ids of chunk(gone, 200)) await store.tombstoneByGoogleIds(calendar.id, ids, now);

  return {
    mode: 'full',
    upserted: seen.size,
    removed: gone.length,
    state: { syncToken: nextSyncToken ?? null, windowStart, windowEnd, lastFullSyncAt: now },
  };
}
