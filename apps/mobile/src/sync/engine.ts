/**
 * Sync engine: push the outbox, then pull server changes, then apply them locally.
 *
 * Conflict policy (v1, see docs/architecture/sync-v1.md):
 * - Writes are field-level: an UPDATE carries only the fields the member changed,
 *   so concurrent edits to different fields both survive.
 * - Local pending changes win over incoming server rows until they have been pushed.
 *   The incoming row is overlaid with the pending mutations, so unsynced edits stay visible.
 * - Deletes are tombstones and propagate on pull.
 * - Rejected mutations are dropped from the outbox and reconciled: a rejected INSERT is
 *   removed locally; a rejected UPDATE/DELETE forces a full re-pull to restore server state.
 */
import type { ClientMutation, SyncEntityName, SyncPullResult, RejectedMutation } from '@diade/domain';
import { ApiError } from '@diade/api-client';
import { apiClient } from '../api/client';
import {
  getLocalDb,
  getPendingMutations,
  removeAppliedMutations,
  getSyncMeta,
  setSyncMeta,
} from '../storage/sqlite';
import { ENTITY_TABLES } from '../data/repository';
import { getPendingCount } from '../data/queries';
import { toColumns, type Row } from '../data/mapping';
import { emitDataChanged } from '../data/changes';

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const CURSOR_KEY = 'pull_cursor';
const LAST_SYNC_KEY = 'last_synced_at';
const PUSH_BATCH_SIZE = 250; // matches the server's syncPushSchema max

let state: SyncState = { status: 'idle', pendingCount: 0, lastSyncedAt: null, lastError: null };
const stateListeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSyncState(listener: (s: SyncState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  stateListeners.forEach((listener) => listener(state));
}

let inFlight: Promise<SyncStatus> | null = null;

/** Runs one sync cycle. Concurrent callers share the in-flight run. */
export function runSync(): Promise<SyncStatus> {
  if (!inFlight) {
    inFlight = syncOnce().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function syncOnce(): Promise<SyncStatus> {
  setState({ status: 'syncing', lastError: null });
  try {
    await flushOutbox();
    await pullChanges();
    const lastSyncedAt = new Date().toISOString();
    await setSyncMeta(LAST_SYNC_KEY, lastSyncedAt);
    setState({ status: 'idle', lastSyncedAt, pendingCount: await getPendingCount() });
    return 'idle';
  } catch (err) {
    const pendingCount = await getPendingCount().catch(() => state.pendingCount);
    if (err instanceof ApiError) {
      const message =
        err.statusCode === 401 ? 'Sign in again to keep syncing' : err.message;
      setState({ status: 'error', lastError: message, pendingCount });
      return 'error';
    }
    // Anything else (no route to the server, DNS, TLS) is treated as offline and retried later.
    setState({ status: 'offline', lastError: null, pendingCount });
    return 'offline';
  }
}

async function flushOutbox(): Promise<void> {
  for (;;) {
    const pending = await getPendingMutations();
    if (pending.length === 0) return;

    const batch = pending.slice(0, PUSH_BATCH_SIZE);
    const result = await apiClient.syncPush({ mutations: batch });

    const applied = result.appliedMutationIds ?? [];
    const rejected = result.rejectedMutations ?? [];
    await reconcileRejected(rejected, batch);

    const done = [...applied, ...rejected.map((r) => r.id)];
    if (done.length === 0) return; // server acknowledged nothing; stop rather than loop
    await removeAppliedMutations(done);
    setState({ pendingCount: await getPendingCount() });
  }
}

async function reconcileRejected(rejected: RejectedMutation[], batch: ClientMutation[]): Promise<void> {
  if (rejected.length === 0) return;
  const byId = new Map(batch.map((m) => [m.id, m]));
  const db = await getLocalDb();
  let needsFullPull = false;

  for (const rejection of rejected) {
    const mutation = byId.get(rejection.id);
    console.warn(`[sync] server rejected ${rejection.code}: ${rejection.message}`);
    if (!mutation) continue;

    if (mutation.operation === 'INSERT') {
      // The server never accepted this record, so it must not linger on this device.
      await db.runAsync(`DELETE FROM ${ENTITY_TABLES[mutation.entity]} WHERE id = ?`, [
        mutation.recordId,
      ]);
    } else {
      needsFullPull = true;
    }
  }

  if (needsFullPull) await setSyncMeta(CURSOR_KEY, '');
  emitDataChanged();
}

async function pullChanges(): Promise<void> {
  const cursor = (await getSyncMeta(CURSOR_KEY)) || undefined;
  const result = await apiClient.syncPull(cursor);
  await applyPull(result);
  await setSyncMeta(CURSOR_KEY, result.cursor);
}

/** Pending local changes, folded per record, so they can be overlaid on incoming rows. */
function buildOverlays(pending: ClientMutation[]): Map<string, Row> {
  const overlays = new Map<string, Row>();
  const now = new Date().toISOString();
  for (const mutation of pending) {
    const current = overlays.get(mutation.recordId) ?? {};
    if (mutation.operation === 'DELETE') {
      current.deletedAt = now;
    } else {
      Object.assign(current, mutation.payload);
    }
    overlays.set(mutation.recordId, current);
  }
  return overlays;
}

const PULL_SECTIONS: Array<[SyncEntityName, keyof SyncPullResult]> = [
  ['events', 'events'],
  ['tasks', 'tasks'],
  ['lists', 'lists'],
  ['list_items', 'listItems'],
  ['capture_items', 'captureItems'],
  ['important_dates', 'importantDates'],
];

/** Server-owned mirrors: stored as received, with no pending local changes to overlay. */
const EXTERNAL_SECTIONS: Array<['local_external_calendars' | 'local_external_events', 'externalCalendars' | 'externalEvents']> = [
  ['local_external_calendars', 'externalCalendars'],
  ['local_external_events', 'externalEvents'],
];

async function applyPull(result: SyncPullResult): Promise<void> {
  const overlays = buildOverlays(await getPendingMutations());
  const db = await getLocalDb();

  await db.withTransactionAsync(async () => {
    for (const [entity, section] of PULL_SECTIONS) {
      const rows = (result[section] as unknown as Row[]) ?? [];
      for (const serverRow of rows) {
        const merged: Row = { ...serverRow, ...(overlays.get(serverRow.id as string) ?? {}) };
        const { columns, values } = toColumns(merged);
        await db.runAsync(
          `INSERT OR REPLACE INTO ${ENTITY_TABLES[entity]} (${columns.join(', ')}) VALUES (${columns
            .map(() => '?')
            .join(', ')})`,
          values as (string | number | null)[],
        );
      }
    }
    for (const [table, section] of EXTERNAL_SECTIONS) {
      for (const serverRow of (result[section] as unknown as Row[] | undefined) ?? []) {
        const { columns, values } = toColumns(serverRow);
        await db.runAsync(
          `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          values as (string | number | null)[],
        );
      }
    }
  });

  // `importantDates` is absent from responses by an API that predates the entity.
  const pulled = [...PULL_SECTIONS.map(([, section]) => section), ...EXTERNAL_SECTIONS.map(([, section]) => section)].reduce(
    (total, section) => total + (((result[section] as unknown as Row[] | undefined) ?? []).length),
    0,
  );
  if (pulled > 0) emitDataChanged();
}
