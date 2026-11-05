import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbClient } from '../db';
import { externalEvents } from '../db/schema';
import type { EventStore } from './engine';
import type { EventValues } from './mapper';

const CHUNK = 100;

/**
 * Columns whose change must bump `updated_at`, so devices only re-download events that
 * actually changed. A full re-sync of unchanged events writes nothing.
 */
const CONTENT_COLUMNS = [
  ['ical_uid', externalEvents.icalUid],
  ['title', externalEvents.title],
  ['description', externalEvents.description],
  ['location', externalEvents.location],
  ['start_at', externalEvents.startAt],
  ['end_at', externalEvents.endAt],
  ['start_date', externalEvents.startDate],
  ['end_date', externalEvents.endDate],
  ['is_all_day', externalEvents.isAllDay],
  ['status', externalEvents.status],
  ['transparency', externalEvents.transparency],
  ['my_response', externalEvents.myResponse],
  ['google_visibility', externalEvents.googleVisibility],
  ['html_link', externalEvents.htmlLink],
  ['is_recurring_instance', externalEvents.isRecurringInstance],
  ['deleted_at', externalEvents.deletedAt],
] as const;

export function createDrizzleEventStore(db: DbClient): EventStore {
  return {
    async upsertEvents(calendarId, userId, rows, now) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        await db
          .insert(externalEvents)
          .values(
            batch.map((row: EventValues) => ({
              calendarId,
              userId,
              ...row,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .onConflictDoUpdate({
            target: [externalEvents.calendarId, externalEvents.googleEventId],
            set: {
              ...Object.fromEntries(CONTENT_COLUMNS.map(([name, col]) => [keyOf(col), sql.raw(`excluded.${name}`)])),
              deletedAt: null,
              updatedAt: now,
            },
            // Skip rows that are identical to what we already hold (including "not deleted").
            setWhere: sql`(${sql.join(
              CONTENT_COLUMNS.map(([, col]) => sql`${col}`),
              sql`, `,
            )}) IS DISTINCT FROM (${sql.join(
              CONTENT_COLUMNS.map(([name]) => (name === 'deleted_at' ? sql`NULL::timestamp` : sql.raw(`excluded.${name}`))),
              sql`, `,
            )})`,
          });
      }
    },

    async tombstoneByGoogleIds(calendarId, ids, now) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        await db
          .update(externalEvents)
          // Content is blanked too: a tombstone only has to say "gone".
          .set({ deletedAt: now, updatedAt: now, title: null, description: null, location: null, htmlLink: null })
          .where(
            and(
              eq(externalEvents.calendarId, calendarId),
              inArray(externalEvents.googleEventId, ids.slice(i, i + CHUNK)),
              isNull(externalEvents.deletedAt),
            ),
          );
      }
    },

    async listLiveGoogleIds(calendarId) {
      const rows = await db
        .select({ id: externalEvents.googleEventId })
        .from(externalEvents)
        .where(and(eq(externalEvents.calendarId, calendarId), isNull(externalEvents.deletedAt)));
      return rows.map((r) => r.id);
    },
  };
}

/** Drizzle column object -> its TypeScript property name on the table. */
function keyOf(column: unknown): string {
  for (const [key, value] of Object.entries(externalEvents)) {
    if (value === column) return key;
  }
  throw new Error('Unknown external_events column');
}
