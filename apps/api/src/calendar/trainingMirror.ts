/**
 * Training blocks in Google Calendar (docs/plans/health, H5). One way: Díade's `workout` events are copied into one
 * calendar Díade creates in the member's Google account ("Díade · Treino"), as recurring events shown as free, so
 * they never block a meeting. Edits made to them in Google are overwritten at the next mirror; the calendar is left
 * out of the import, so blocks do not come back as Google events.
 *
 * What was written is kept on the member (`space_members.training_google`): the calendar id and, per Díade event,
 * the Google event id and the body last sent, so an unchanged block costs no request.
 */

import { GOOGLE_TRAINING_SCOPE, TRAINING_CALENDAR_NAME } from '@diade/domain';
import { and, eq, isNull } from 'drizzle-orm';
import type { DbClient } from '../db';
import { accounts, events, spaceMembers } from '../db/schema';
import {
  createGoogleClient,
  type FetchFn,
  GoogleApiError,
  GoogleAuthError,
  type GoogleClient,
  type GoogleEventWrite,
} from './google';
import { getGoogleAccessToken, hasScopes, type TokenEnv } from './tokens';

export interface TrainingMirrorState {
  enabled: boolean;
  /** The member's IANA time zone, so a block stays at 17:30 across daylight saving. */
  timeZone: string;
  calendarId: string | null;
  /** Díade event id → the Google event and the body last written. */
  events: Record<string, { googleId: string; body: string }>;
  lastError: 'needs_reauth' | 'failed' | null;
  syncedAt: string | null;
}

export interface MirrorSource {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  recurrenceRule: string | null;
}

/** What Google is sent for a block: no reminders, private, and free so it never shows as busy. */
export function eventBody(source: MirrorSource, timeZone: string): GoogleEventWrite {
  return {
    summary: source.title,
    description: 'Díade',
    start: { dateTime: source.startAt.toISOString(), timeZone },
    end: { dateTime: source.endAt.toISOString(), timeZone },
    ...(source.recurrenceRule ? { recurrence: [`RRULE:${source.recurrenceRule}`] } : {}),
    transparency: 'transparent',
    visibility: 'private',
    reminders: { useDefault: false },
    extendedProperties: { private: { diadeEventId: source.id } },
  };
}

export interface MirrorPlan {
  insert: Array<{ source: MirrorSource; body: GoogleEventWrite }>;
  update: Array<{ source: MirrorSource; body: GoogleEventWrite; googleId: string }>;
  remove: Array<{ eventId: string; googleId: string }>;
}

/** The writes that bring Google in line with the blocks. Pure; an unchanged block needs none. */
export function planMirror(
  sources: readonly MirrorSource[],
  written: TrainingMirrorState['events'],
  timeZone: string,
): MirrorPlan {
  const plan: MirrorPlan = { insert: [], update: [], remove: [] };
  const live = new Set<string>();
  for (const source of sources) {
    live.add(source.id);
    const body = eventBody(source, timeZone);
    const previous = written[source.id];
    if (!previous) plan.insert.push({ source, body });
    else if (previous.body !== JSON.stringify(body))
      plan.update.push({ source, body, googleId: previous.googleId });
  }
  for (const [eventId, { googleId }] of Object.entries(written)) {
    if (!live.has(eventId)) plan.remove.push({ eventId, googleId });
  }
  return plan;
}

export interface MirrorDeps {
  db: DbClient;
  env: TokenEnv;
  fetchFn?: FetchFn;
  now?: () => Date;
}

const nowOf = (deps: MirrorDeps) => (deps.now ? deps.now() : new Date());

async function writableAccount(db: DbClient, userId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'google')))
    .limit(1);
  return account?.refreshToken && hasScopes(account.scope, [GOOGLE_TRAINING_SCOPE])
    ? account
    : null;
}

function clientFor(deps: MirrorDeps, accountId: string): GoogleClient {
  return createGoogleClient(
    (force) =>
      getGoogleAccessToken(deps.db, deps.env, accountId, {
        forceRefresh: force,
        fetchFn: deps.fetchFn,
        now: nowOf(deps),
      }),
    deps.fetchFn,
  );
}

async function stateOf(db: DbClient, userId: string): Promise<TrainingMirrorState | null> {
  const [member] = await db
    .select({ state: spaceMembers.trainingGoogle })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, userId))
    .limit(1);
  return member?.state ?? null;
}

async function saveState(db: DbClient, userId: string, state: TrainingMirrorState | null) {
  await db
    .update(spaceMembers)
    .set({ trainingGoogle: state })
    .where(eq(spaceMembers.userId, userId));
}

/** The calendar id Google gave the training calendar, so the import can leave it out. */
export async function trainingCalendarId(db: DbClient, userId: string): Promise<string | null> {
  return (await stateOf(db, userId))?.calendarId ?? null;
}

export interface MirrorStatus {
  enabled: boolean;
  /** Whether the member's Google grant includes the scope; false means they must connect again. */
  canWrite: boolean;
  blocks: number;
  lastError: TrainingMirrorState['lastError'];
  syncedAt: string | null;
}

export async function trainingMirrorStatus(db: DbClient, userId: string): Promise<MirrorStatus> {
  const state = await stateOf(db, userId);
  return {
    enabled: state?.enabled ?? false,
    canWrite: (await writableAccount(db, userId)) !== null,
    blocks: Object.keys(state?.events ?? {}).length,
    lastError: state?.lastError ?? null,
    syncedAt: state?.syncedAt ?? null,
  };
}

/** Google calls in flight at once: a new calendar takes seconds per insert, and Google rate-limits bursts. */
const WRITES_AT_ONCE = 5;

/**
 * Runs `write` over the items, `limit` at a time. After the first failure it starts no more, waits for the ones
 * running, then throws that failure, so every write that succeeded has been recorded.
 */
export async function writeEach<T>(
  items: readonly T[],
  write: (item: T) => Promise<void>,
  limit = WRITES_AT_ONCE,
): Promise<void> {
  let next = 0;
  const failures: unknown[] = [];
  const worker = async () => {
    while (failures.length === 0 && next < items.length) {
      const item = items[next++] as T;
      try {
        await write(item);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failures.length > 0) throw failures[0];
}

/**
 * Copies the member's blocks to Google. Creates the calendar the first time. Does nothing when the member has not
 * turned it on. Never throws for a Google failure: it records it, and the next mirror tries again.
 */
export async function mirrorTraining(deps: MirrorDeps, userId: string): Promise<MirrorStatus> {
  const { db } = deps;
  const state = await stateOf(db, userId);
  if (!state?.enabled) return trainingMirrorStatus(db, userId);
  const account = await writableAccount(db, userId);
  if (!account) {
    await saveState(db, userId, { ...state, lastError: 'needs_reauth' });
    return trainingMirrorStatus(db, userId);
  }
  const google = clientFor(deps, account.id);
  const next: TrainingMirrorState = { ...state, events: { ...state.events } };
  try {
    if (!next.calendarId) {
      next.calendarId = (await google.insertCalendar(TRAINING_CALENDAR_NAME, next.timeZone)).id;
      next.events = {};
    }
    const calendarId = next.calendarId;
    const rows = await db
      .select()
      .from(events)
      .where(
        and(eq(events.creatorId, userId), eq(events.category, 'workout'), isNull(events.deletedAt)),
      );
    const plan = planMirror(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        startAt: row.startAt,
        endAt: row.endAt,
        recurrenceRule: row.recurrenceRule,
      })),
      next.events,
      next.timeZone,
    );
    await writeEach(plan.remove, async ({ eventId, googleId }) => {
      await google.deleteEvent(calendarId, googleId);
      delete next.events[eventId];
    });
    await writeEach(plan.update, async ({ source, body, googleId }) => {
      try {
        await google.patchEvent(calendarId, googleId, body);
        next.events[source.id] = { googleId, body: JSON.stringify(body) };
      } catch (err) {
        // Deleted by hand in Google: write it again.
        if (!(err instanceof GoogleApiError && (err.status === 404 || err.status === 410)))
          throw err;
        const created = await google.insertEvent(calendarId, body);
        next.events[source.id] = { googleId: created.id, body: JSON.stringify(body) };
      }
    });
    await writeEach(plan.insert, async ({ source, body }) => {
      const created = await google.insertEvent(calendarId, body);
      next.events[source.id] = { googleId: created.id, body: JSON.stringify(body) };
    });
    next.lastError = null;
    next.syncedAt = nowOf(deps).toISOString();
  } catch (err) {
    console.error('[training mirror]', err instanceof Error ? err.message : err);
    next.lastError = err instanceof GoogleAuthError ? 'needs_reauth' : 'failed';
  }
  // Whatever was written before a failure is recorded, so it is not written twice.
  await saveState(db, userId, next);
  return trainingMirrorStatus(db, userId);
}

/** Turns the mirror on (keeping the calendar of an earlier time, if any) and mirrors straight away. */
export async function enableTrainingMirror(
  deps: MirrorDeps,
  userId: string,
  timeZone: string,
): Promise<MirrorStatus> {
  const state = await stateOf(deps.db, userId);
  await saveState(deps.db, userId, {
    enabled: true,
    timeZone,
    calendarId: state?.calendarId ?? null,
    events: state?.calendarId ? state.events : {},
    lastError: null,
    syncedAt: state?.syncedAt ?? null,
  });
  return mirrorTraining(deps, userId);
}

/**
 * Turns the mirror off and deletes the calendar from Google, blocks and all. When Google cannot be reached the
 * calendar stays there, and the member can delete it in Google; Díade forgets it either way.
 */
export async function disableTrainingMirror(
  deps: MirrorDeps,
  userId: string,
): Promise<MirrorStatus> {
  const state = await stateOf(deps.db, userId);
  const account = await writableAccount(deps.db, userId);
  if (state?.calendarId && account) {
    try {
      await clientFor(deps, account.id).deleteCalendar(state.calendarId);
    } catch (err) {
      console.error(
        '[training mirror] could not delete the calendar',
        err instanceof Error ? err.message : err,
      );
    }
  }
  await saveState(deps.db, userId, null);
  return trainingMirrorStatus(deps.db, userId);
}
