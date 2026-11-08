import type {
  CalendarEvent,
  CaptureItem,
  ExternalCalendar,
  ExternalEvent,
  ImportantDate,
  Ingredient,
  ListItem,
  MealPlan,
  Recipe,
  SharedList,
  Task,
} from '@diade/domain';
import { getLocalDb } from '../storage/sqlite';
import { fromRow } from './mapping';

// Reads exclude tombstones. Personal-visibility filtering is enforced by the server
// during pull, so the local store only ever holds records this member may see.

async function selectActive<T>(table: string, orderBy: string): Promise<T[]> {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE deleted_at IS NULL ORDER BY ${orderBy}`,
  );
  return rows.map((row) => fromRow(row) as unknown as T);
}

export const getActiveEvents = () => selectActive<CalendarEvent>('local_events', 'start_at ASC');

export const getActiveTasks = () =>
  selectActive<Task>('local_tasks', 'due_date IS NULL, due_date ASC, created_at ASC');

export const getActiveLists = () => selectActive<SharedList>('local_lists', 'created_at ASC');

export const getActiveListItems = () =>
  selectActive<ListItem>(
    'local_list_items',
    // Manually ordered items first, in order; never-ordered items follow in the order they were added.
    'is_checked ASC, position IS NULL, position ASC, created_at ASC',
  );

export interface ItemHistoryRow {
  category: string;
  name: string;
  count: number;
  lastUsedAt: string;
}

/**
 * Every item name ever added, per list category, with how often and when last. Unlike the
 * other reads this deliberately includes tombstoned rows: clearing checked items is how
 * most items disappear, and they are exactly what autocomplete should remember.
 */
export async function getItemHistory(): Promise<ItemHistoryRow[]> {
  const db = await getLocalDb();
  return db.getAllAsync<ItemHistoryRow>(
    `SELECT l.category AS category,
            MIN(li.name) AS name,
            COUNT(*) AS count,
            MAX(li.created_at) AS lastUsedAt
       FROM local_list_items li
       JOIN local_lists l ON l.id = li.list_id
      GROUP BY l.category, lower(li.name)`,
  );
}

export const getActiveImportantDates = () =>
  selectActive<ImportantDate>('local_important_dates', 'date ASC, created_at ASC');

export const getExternalEvents = () =>
  selectActive<ExternalEvent>('local_external_events', 'COALESCE(start_at, start_date) ASC');

export const getExternalCalendars = () =>
  selectActive<ExternalCalendar>('local_external_calendars', 'name IS NULL, name ASC');

export const getInboxItems = async (): Promise<CaptureItem[]> => {
  const db = await getLocalDb();
  const rows = await db.getAllAsync<Record<string, unknown>>(
    `SELECT * FROM local_capture_items WHERE deleted_at IS NULL AND status = 'inbox' ORDER BY created_at DESC`,
  );
  return rows.map((row) => fromRow(row) as unknown as CaptureItem);
};

export async function getPendingCount(): Promise<number> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM local_outbox');
  return row?.n ?? 0;
}

export const getActiveRecipes = () =>
  selectActive<Recipe>('local_recipes', 'name COLLATE NOCASE ASC');

export const getActiveMealPlans = () =>
  selectActive<MealPlan>('local_meal_plans', 'starts_on ASC, created_at ASC');

export const getActiveIngredients = () =>
  selectActive<Ingredient>('local_ingredients', 'name COLLATE NOCASE ASC');
