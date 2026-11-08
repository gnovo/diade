import type { ClientMutation } from '@diade/domain';
import * as SQLite from 'expo-sqlite';
import { createSerialQueue } from './serialQueue';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const LOCAL_TABLES = [
  'local_events',
  'local_tasks',
  'local_lists',
  'local_list_items',
  'local_capture_items',
  'local_important_dates',
  'local_recipes',
  'local_meal_plans',
  'local_ingredients',
  'local_external_calendars',
  'local_external_events',
  'local_outbox',
  'local_sync_meta',
] as const;

export async function getLocalDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  // Share one in-flight open so concurrent callers do not race on schema creation.
  // A failed open must not stay cached, or every later call would fail too.
  openPromise ??= openLocalDb().catch((err) => {
    openPromise = null;
    throw err;
  });
  return openPromise;
}

async function openLocalDb(): Promise<SQLite.SQLiteDatabase> {
  dbInstance = await SQLite.openDatabaseAsync('diade.db');

  // Initialize SQLite schema
  await dbInstance.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS local_events (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_all_day INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'shared',
      recurrence_rule TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      highlighted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_tasks (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      assignee_id TEXT,
      title TEXT NOT NULL,
      notes TEXT,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'normal',
      visibility TEXT NOT NULL DEFAULT 'shared',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_lists (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      category TEXT NOT NULL DEFAULT 'groceries',
      plan_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_list_items (
      id TEXT PRIMARY KEY NOT NULL,
      list_id TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity TEXT,
      unit TEXT,
      notes TEXT,
      position REAL,
      -- A JSON array of what each recipe asked for, when the item came from a meal plan; see GroceryContribution.
      contributions TEXT,
      edited_by_hand INTEGER NOT NULL DEFAULT 0,
      is_checked INTEGER NOT NULL DEFAULT 0,
      checked_by TEXT,
      checked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_capture_items (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      content TEXT NOT NULL,
      capture_type TEXT NOT NULL DEFAULT 'text',
      status TEXT NOT NULL DEFAULT 'inbox',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_important_dates (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      person_name TEXT,
      date TEXT NOT NULL,
      count_first_day INTEGER NOT NULL DEFAULT 0,
      repeat TEXT NOT NULL DEFAULT 'yearly',
      pinned INTEGER NOT NULL DEFAULT 0,
      alert_offset_days INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_recipes (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name TEXT NOT NULL,
      servings INTEGER NOT NULL DEFAULT 4,
      notes TEXT,
      -- A JSON array of ingredients; see RecipeIngredient in @diade/domain.
      ingredients TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_meal_plans (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      starts_on TEXT NOT NULL,
      ends_on TEXT NOT NULL,
      -- A JSON array of { recipeId, servings }; see MealPlanRecipe in @diade/domain.
      recipes TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_ingredients (
      id TEXT PRIMARY KEY NOT NULL,
      space_id TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      name TEXT NOT NULL,
      match_key TEXT NOT NULL,
      -- A JSON array of other names (match keys); see Ingredient in @diade/domain.
      aliases TEXT NOT NULL DEFAULT '[]',
      merged_into_id TEXT,
      -- The household's own call on pantry staples (1, 0, or NULL for undecided).
      staple INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    -- Google Calendar (read-only mirror of server rows; never written through the outbox)
    CREATE TABLE IF NOT EXISTS local_external_calendars (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      name TEXT,
      color TEXT,
      time_zone TEXT,
      access_role TEXT,
      sync_enabled INTEGER NOT NULL DEFAULT 1,
      visibility TEXT NOT NULL DEFAULT 'shared',
      last_synced_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS local_external_events (
      id TEXT PRIMARY KEY NOT NULL,
      calendar_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      google_event_id TEXT NOT NULL,
      ical_uid TEXT,
      title TEXT,
      description TEXT,
      location TEXT,
      start_at TEXT,
      end_at TEXT,
      start_date TEXT,
      end_date TEXT,
      is_all_day INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed',
      transparency TEXT NOT NULL DEFAULT 'opaque',
      my_response TEXT,
      google_visibility TEXT,
      visibility_override TEXT,
      html_link TEXT,
      is_recurring_instance INTEGER NOT NULL DEFAULT 0,
      highlighted INTEGER NOT NULL DEFAULT 0,
      effective_visibility TEXT NOT NULL DEFAULT 'shared',
      redacted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    -- Mutation Outbox for Offline Writes
    CREATE TABLE IF NOT EXISTS local_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      record_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      client_timestamp INTEGER NOT NULL
    );

    -- Sync Metadata (cursor tracking)
    CREATE TABLE IF NOT EXISTS local_sync_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  await migrateLocalSchema(dbInstance);

  return dbInstance;
}

/**
 * `CREATE TABLE IF NOT EXISTS` does not add columns to a table an older app version created,
 * so columns added later are checked for and added here.
 */
async function migrateLocalSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const addColumn = async (table: string, column: string, definition: string) => {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!columns.some((c) => c.name === column)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  await addColumn('local_tasks', 'priority', `TEXT NOT NULL DEFAULT 'normal'`);
  await addColumn('local_events', 'highlighted', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('local_external_events', 'highlighted', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('local_list_items', 'position', 'REAL');
  await addColumn('local_important_dates', 'person_name', 'TEXT');
  await addColumn('local_lists', 'plan_id', 'TEXT');
  await addColumn('local_list_items', 'contributions', 'TEXT');
  await addColumn('local_list_items', 'edited_by_hand', 'INTEGER NOT NULL DEFAULT 0');
  await addColumn('local_ingredients', 'staple', 'INTEGER');
}

// --- Transactions ---

const enqueueTransaction = createSerialQueue();

/**
 * Runs `work` in a transaction, one at a time. expo-sqlite shares a single connection and
 * `withTransactionAsync` is not serialised, so two overlapping transactions (a local write
 * while the sync engine applies a pull) end each other's with "cannot commit - no transaction
 * is active". Every write transaction in the app goes through this queue instead. Do not
 * nest calls: the inner one would wait for the outer one forever.
 */
export function inTransaction<T>(work: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  return enqueueTransaction(async () => {
    const db = await getLocalDb();
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await work(db);
    });
    return result;
  });
}

// --- Outbox Management Helpers ---

export async function getPendingMutations(): Promise<ClientMutation[]> {
  const db = await getLocalDb();
  // rowid breaks ties when two writes share a timestamp, keeping INSERT before UPDATE.
  const rows = await db.getAllAsync<{
    id: string;
    entity: string;
    operation: string;
    record_id: string;
    payload: string;
    client_timestamp: number;
  }>('SELECT * FROM local_outbox ORDER BY client_timestamp ASC, rowid ASC');

  return rows.map((r) => ({
    id: r.id,
    entity: r.entity as ClientMutation['entity'],
    operation: r.operation as ClientMutation['operation'],
    recordId: r.record_id,
    payload: JSON.parse(r.payload),
    clientTimestamp: r.client_timestamp,
  }));
}

export async function removeAppliedMutations(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getLocalDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM local_outbox WHERE id IN (${placeholders})`, ids);
}

// --- Sync metadata ---

export async function getSyncMeta(key: string): Promise<string | null> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM local_sync_meta WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync('INSERT OR REPLACE INTO local_sync_meta (key, value) VALUES (?, ?)', [
    key,
    value,
  ]);
}

// --- Sign-out ---

/**
 * Deletes every local record, pending change and cursor. Called on sign-out so that
 * one member's personal data never remains readable on a shared device.
 */
export async function resetLocalDb(): Promise<void> {
  await inTransaction(async (db) => {
    for (const table of LOCAL_TABLES) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });
}
