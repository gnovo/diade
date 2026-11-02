import type { CalendarEvent, Task, SharedList, ListItem, CaptureItem, ImportantDate } from '@diade/domain';
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

export const getActiveTasks = () => selectActive<Task>('local_tasks', 'due_date IS NULL, due_date ASC, created_at ASC');

export const getActiveLists = () => selectActive<SharedList>('local_lists', 'created_at ASC');

export const getActiveListItems = () =>
  selectActive<ListItem>('local_list_items', 'is_checked ASC, created_at ASC');

export const getActiveImportantDates = () =>
  selectActive<ImportantDate>('local_important_dates', 'date ASC, created_at ASC');

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
