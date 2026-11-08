/**
 * Local-first writes. Every change is applied to the SQLite table and queued in the
 * outbox inside one transaction, so the UI updates immediately and the change survives
 * an app restart before it has synced.
 */
import type { SyncEntityName, MutationOperation } from '@diade/domain';
import { parseSyncPayload } from '@diade/validation';
import { getLocalDb, inTransaction } from '../storage/sqlite';
import { toColumns, type Row } from './mapping';
import { newId, nextClientTimestamp } from './ids';
import { emitDataChanged, emitLocalWrite } from './changes';

export const ENTITY_TABLES: Record<SyncEntityName, string> = {
  events: 'local_events',
  tasks: 'local_tasks',
  lists: 'local_lists',
  list_items: 'local_list_items',
  capture_items: 'local_capture_items',
  important_dates: 'local_important_dates',
  recipes: 'local_recipes',
  meal_plans: 'local_meal_plans',
};

export interface WriteContext {
  spaceId: string;
  userId: string;
}

/** Entities that carry space_id and creator_id locally (list items do not). */
const OWNED_ENTITIES = new Set<SyncEntityName>([
  'events',
  'tasks',
  'lists',
  'capture_items',
  'important_dates',
  'recipes',
  'meal_plans',
]);

async function queueMutation(
  db: Awaited<ReturnType<typeof getLocalDb>>,
  entity: SyncEntityName,
  operation: MutationOperation,
  recordId: string,
  payload: Row,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO local_outbox (id, entity, operation, record_id, payload, client_timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [newId(), entity, operation, recordId, JSON.stringify(payload), nextClientTimestamp()],
  );
}

/** Throws a readable error for payloads the server would reject; never queues bad data. */
function validatePayload(entity: SyncEntityName, operation: MutationOperation, payload: Row): Row {
  const result = parseSyncPayload(entity, operation, payload);
  if (!result.success) throw new Error(result.message);
  return result.data;
}

/**
 * Inserts a record locally and queues an INSERT. `fields` are validated against the
 * entity's sync payload schema first, and the validated (defaulted) values are stored.
 */
export async function insertRecord(
  entity: SyncEntityName,
  ctx: WriteContext,
  input: Row,
): Promise<string> {
  const fields = validatePayload(entity, 'INSERT', input);
  const db = await getLocalDb();
  const id = newId();
  const now = new Date().toISOString();

  const row: Row = {
    id,
    ...(OWNED_ENTITIES.has(entity) ? { spaceId: ctx.spaceId, creatorId: ctx.userId } : {}),
    ...fields,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const { columns, values } = toColumns(row);

  await inTransaction(async () => {
    await db.runAsync(
      `INSERT INTO ${ENTITY_TABLES[entity]} (${columns.join(', ')}) VALUES (${columns
        .map(() => '?')
        .join(', ')})`,
      values as (string | number | null)[],
    );
    await queueMutation(db, entity, 'INSERT', id, fields);
  });

  emitDataChanged();
  emitLocalWrite();
  return id;
}

/** Applies a partial update locally and queues an UPDATE carrying only the changed fields. */
export async function updateRecord(
  entity: SyncEntityName,
  id: string,
  input: Row,
): Promise<void> {
  const changes = validatePayload(entity, 'UPDATE', input);
  const db = await getLocalDb();
  const now = new Date().toISOString();
  const { columns, values } = toColumns({ ...changes, updatedAt: now });

  await inTransaction(async () => {
    await db.runAsync(
      `UPDATE ${ENTITY_TABLES[entity]} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...(values as (string | number | null)[]), id],
    );
    await queueMutation(db, entity, 'UPDATE', id, changes);
  });

  emitDataChanged();
  emitLocalWrite();
}

/**
 * Applies several partial updates in one transaction, so a reader (or the sync engine) never sees
 * a half-applied set, and the UI re-reads once. Used when a reorder renumbers several items.
 */
export async function updateRecords(
  entity: SyncEntityName,
  updates: Array<{ id: string; changes: Row }>,
): Promise<void> {
  if (updates.length === 0) return;
  const prepared = updates.map(({ id, changes }) => ({ id, changes: validatePayload(entity, 'UPDATE', changes) }));
  const now = new Date().toISOString();

  await inTransaction(async (db) => {
    for (const { id, changes } of prepared) {
      const { columns, values } = toColumns({ ...changes, updatedAt: now });
      await db.runAsync(
        `UPDATE ${ENTITY_TABLES[entity]} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...(values as (string | number | null)[]), id],
      );
      await queueMutation(db, entity, 'UPDATE', id, changes);
    }
  });

  emitDataChanged();
  emitLocalWrite();
}

/** Soft-deletes locally (tombstone) and queues a DELETE so the deletion propagates. */
export async function deleteRecord(entity: SyncEntityName, id: string): Promise<void> {
  const db = await getLocalDb();
  const now = new Date().toISOString();

  await inTransaction(async () => {
    await db.runAsync(
      `UPDATE ${ENTITY_TABLES[entity]} SET deleted_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, id],
    );
    await queueMutation(db, entity, 'DELETE', id, {});
  });

  emitDataChanged();
  emitLocalWrite();
}

/** One write in a batch. `id` on an insert lets a later write in the same batch refer to the new record. */
export type BatchWrite =
  | { op: 'insert'; entity: SyncEntityName; id?: string; input: Row }
  | { op: 'update'; entity: SyncEntityName; id: string; changes: Row }
  | { op: 'delete'; entity: SyncEntityName; id: string };

/**
 * Applies several inserts, updates and deletes in one transaction, so a reader (or the sync engine)
 * never sees half of them and the UI re-reads once. Everything is validated before anything is written.
 * Used to generate a grocery list (the list and all its items) and to apply "Update from plan".
 */
export async function writeBatch(ctx: WriteContext, writes: BatchWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const now = new Date().toISOString();
  const prepared = writes.map((write) => {
    if (write.op === 'insert') {
      const fields = validatePayload(write.entity, 'INSERT', write.input);
      return { ...write, id: write.id ?? newId(), fields };
    }
    if (write.op === 'update') return { ...write, fields: validatePayload(write.entity, 'UPDATE', write.changes) };
    return write;
  });

  await inTransaction(async (db) => {
    for (const write of prepared) {
      const table = ENTITY_TABLES[write.entity];
      if (write.op === 'insert') {
        const { columns, values } = toColumns({
          id: write.id,
          ...(OWNED_ENTITIES.has(write.entity) ? { spaceId: ctx.spaceId, creatorId: ctx.userId } : {}),
          ...write.fields,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
        await db.runAsync(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          values as (string | number | null)[],
        );
        await queueMutation(db, write.entity, 'INSERT', write.id, write.fields);
      } else if (write.op === 'update') {
        const { columns, values } = toColumns({ ...write.fields, updatedAt: now });
        await db.runAsync(
          `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
          [...(values as (string | number | null)[]), write.id],
        );
        await queueMutation(db, write.entity, 'UPDATE', write.id, write.fields);
      } else {
        await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, write.id]);
        await queueMutation(db, write.entity, 'DELETE', write.id, {});
      }
    }
  });

  emitDataChanged();
  emitLocalWrite();
}
