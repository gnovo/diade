import { describe, expect, it } from 'vitest';
import {
  type EventStore,
  FULL_SYNC_MAX_AGE_DAYS,
  needsFullSync,
  type SyncTarget,
  syncCalendarEvents,
  WINDOW_REBASE_DAYS,
} from './engine';
import {
  GoogleApiError,
  type GoogleClient,
  type GoogleEvent,
  type GoogleEventsPage,
  type ListEventsParams,
} from './google';
import type { EventValues } from './mapper';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-05T12:00:00Z');

const ev = (id: string, summary = id): GoogleEvent => ({
  id,
  status: 'confirmed',
  summary,
  start: { dateTime: '2026-11-10T09:00:00Z' },
  end: { dateTime: '2026-11-10T10:00:00Z' },
});

class MemoryStore implements EventStore {
  rows = new Map<string, EventValues & { deleted: boolean }>();
  async upsertEvents(_c: string, _u: string, rows: EventValues[], _now?: Date) {
    for (const r of rows) this.rows.set(r.googleEventId, { ...r, deleted: false });
  }
  async tombstoneByGoogleIds(_c: string, ids: string[]) {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row) row.deleted = true;
    }
  }
  async listLiveGoogleIds() {
    return [...this.rows.entries()].filter(([, r]) => !r.deleted).map(([id]) => id);
  }
  live() {
    return this.listLiveGoogleIds();
  }
}

/** A scripted Google: each call returns (or throws) the next response. */
function script(responses: Array<GoogleEventsPage | Error>) {
  const calls: ListEventsParams[] = [];
  const client: GoogleClient = {
    listCalendars: async () => [],
    listEvents: async (_id, params) => {
      calls.push(params);
      const next = responses.shift();
      if (!next) throw new Error('unexpected extra call');
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { client, calls };
}

const target = (over: Partial<SyncTarget> = {}): SyncTarget => ({
  id: 'cal1',
  userId: 'u1',
  googleCalendarId: 'primary',
  syncToken: 'TOKEN',
  windowStart: new Date(NOW.getTime() - 30 * DAY),
  windowEnd: new Date(NOW.getTime() + 300 * DAY),
  lastFullSyncAt: new Date(NOW.getTime() - 1 * DAY),
  ...over,
});

describe('needsFullSync', () => {
  const state = target();
  it('is false for a fresh, healthy baseline', () => {
    expect(needsFullSync(state, NOW)).toBe(false);
  });
  it('is true without a sync token or baseline', () => {
    expect(needsFullSync({ ...state, syncToken: null }, NOW)).toBe(true);
    expect(needsFullSync({ ...state, windowEnd: null }, NOW)).toBe(true);
    expect(needsFullSync({ ...state, lastFullSyncAt: null }, NOW)).toBe(true);
  });
  it('rolls the window forward when little future is left', () => {
    const windowEnd = new Date(NOW.getTime() + (WINDOW_REBASE_DAYS - 1) * DAY);
    expect(needsFullSync({ ...state, windowEnd }, NOW)).toBe(true);
  });
  it('re-baselines weekly', () => {
    const lastFullSyncAt = new Date(NOW.getTime() - (FULL_SYNC_MAX_AGE_DAYS + 1) * DAY);
    expect(needsFullSync({ ...state, lastFullSyncAt }, NOW)).toBe(true);
  });
});

describe('syncCalendarEvents', () => {
  it('runs a full sync over the window and stores the new sync token', async () => {
    const { client, calls } = script([{ items: [ev('a'), ev('b')], nextSyncToken: 'T1' }]);
    const store = new MemoryStore();
    const result = await syncCalendarEvents(
      { google: client, store },
      target({ syncToken: null }),
      NOW,
    );

    expect(result.mode).toBe('full');
    expect(result.state.syncToken).toBe('T1');
    expect(result.state.lastFullSyncAt).toEqual(NOW);
    expect(calls[0]!.timeMin?.toISOString()).toBe('2026-10-06T12:00:00.000Z');
    expect(calls[0]!.timeMax?.toISOString()).toBe('2027-11-05T12:00:00.000Z');
    expect(await store.live()).toEqual(['a', 'b']);
  });

  it('follows pagination and takes the sync token from the last page', async () => {
    const { client, calls } = script([
      { items: [ev('a')], nextPageToken: 'p2' },
      { items: [ev('b')], nextSyncToken: 'T9' },
    ]);
    const result = await syncCalendarEvents(
      { google: client, store: new MemoryStore() },
      target({ syncToken: null }),
      NOW,
    );
    expect(calls[1]!.pageToken).toBe('p2');
    expect(result.state.syncToken).toBe('T9');
    expect(result.upserted).toBe(2);
  });

  it('tombstones stored events a full sync no longer returns', async () => {
    const store = new MemoryStore();
    await store.upsertEvents(
      'cal1',
      'u1',
      [{ ...(await fromEv(ev('keep'))) }, { ...(await fromEv(ev('moved-away'))) }],
      NOW,
    );
    const { client } = script([{ items: [ev('keep')], nextSyncToken: 'T' }]);

    const result = await syncCalendarEvents(
      { google: client, store },
      target({ syncToken: null }),
      NOW,
    );
    expect(await store.live()).toEqual(['keep']);
    expect(result.removed).toBe(1);
  });

  it('applies incremental changes: updates, additions and cancellations', async () => {
    const store = new MemoryStore();
    await store.upsertEvents(
      'cal1',
      'u1',
      [await fromEv(ev('old')), await fromEv(ev('edit', 'before'))],
      NOW,
    );
    const { client, calls } = script([
      {
        items: [{ id: 'old', status: 'cancelled' }, ev('edit', 'after'), ev('new')],
        nextSyncToken: 'T2',
      },
    ]);

    const result = await syncCalendarEvents({ google: client, store }, target(), NOW);
    expect(result.mode).toBe('incremental');
    expect(calls[0]!.syncToken).toBe('TOKEN');
    expect(calls[0]!.timeMin).toBeUndefined();
    expect(await store.live()).toEqual(['edit', 'new']);
    expect(store.rows.get('edit')!.title).toBe('after');
    expect(result.state.syncToken).toBe('T2');
    // Window and baseline are unchanged by an incremental run.
    expect(result.state.lastFullSyncAt).toEqual(target().lastFullSyncAt);
  });

  it('lets a later cancellation win over an earlier change in the same run', async () => {
    const store = new MemoryStore();
    const { client } = script([
      { items: [ev('x')], nextPageToken: 'p2' },
      { items: [{ id: 'x', status: 'cancelled' }], nextSyncToken: 'T' },
    ]);
    await syncCalendarEvents({ google: client, store }, target(), NOW);
    expect(store.rows.has('x')).toBe(false);
  });

  it('recovers from 410 Gone with a full sync in the same call', async () => {
    const store = new MemoryStore();
    await store.upsertEvents('cal1', 'u1', [await fromEv(ev('stale'))], NOW);
    const { client, calls } = script([
      new GoogleApiError('Gone', 410),
      { items: [ev('fresh')], nextSyncToken: 'NEW' },
    ]);

    const result = await syncCalendarEvents({ google: client, store }, target(), NOW);
    expect(result.mode).toBe('full');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.syncToken).toBe('TOKEN');
    expect(calls[1]!.syncToken).toBeUndefined();
    expect(result.state.syncToken).toBe('NEW');
    expect(await store.live()).toEqual(['fresh']);
  });

  it('does not write anything when a page fails, so the old token stays valid', async () => {
    const store = new MemoryStore();
    const { client } = script([
      { items: [ev('a')], nextPageToken: 'p2' },
      new GoogleApiError('Server error', 500),
    ]);
    await expect(syncCalendarEvents({ google: client, store }, target(), NOW)).rejects.toThrow(
      'Server error',
    );
    expect(store.rows.size).toBe(0);
  });

  it('forces a full sync when asked', async () => {
    const { client, calls } = script([{ items: [], nextSyncToken: 'T' }]);
    const result = await syncCalendarEvents(
      { google: client, store: new MemoryStore() },
      target(),
      NOW,
      { forceFull: true },
    );
    expect(result.mode).toBe('full');
    expect(calls[0]!.syncToken).toBeUndefined();
  });
});

async function fromEv(event: GoogleEvent): Promise<EventValues> {
  const { mapGoogleEvent } = await import('./mapper');
  const mapped = mapGoogleEvent(event);
  if (mapped.kind !== 'upsert') throw new Error('bad fixture');
  return mapped.values;
}
