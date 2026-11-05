import { and, eq, gt, inArray, or } from 'drizzle-orm';
import {
  redactExternalCalendar,
  redactExternalEvent,
  resolveEffectiveVisibility,
  type ExternalCalendar,
  type ExternalEvent,
  type ExternalVisibility,
  type ExternalVisibilityOverride,
  type GoogleAccessRole,
  type GoogleEventVisibility,
  type ExternalResponse,
  type StoredExternalEvent,
} from '@diade/domain';
import type { DbClient } from '../db';
import { externalCalendars, externalEvents, spaceMembers } from '../db/schema';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/**
 * The external calendars and events a member's device should receive since `since`:
 * their own in full, and their partner's after server-side redaction. This is the only
 * place partner data leaves the server, so redaction cannot be bypassed by the client.
 */
export async function buildExternalPull(
  db: DbClient,
  params: { since: Date; spaceId: string; viewerId: string },
): Promise<{ externalCalendars: ExternalCalendar[]; externalEvents: ExternalEvent[] }> {
  const { since, spaceId, viewerId } = params;

  const members = await db
    .select({ userId: spaceMembers.userId })
    .from(spaceMembers)
    .where(eq(spaceMembers.spaceId, spaceId));
  const userIds = members.map((m) => m.userId);
  if (userIds.length === 0) return { externalCalendars: [], externalEvents: [] };

  // Calendars first: events need their calendar's visibility to resolve.
  const calendarRows = await db
    .select()
    .from(externalCalendars)
    .where(inArray(externalCalendars.userId, userIds));
  const calendarsById = new Map(calendarRows.map((c) => [c.id, c]));

  const eventRows = await db
    .select()
    .from(externalEvents)
    .where(
      and(
        inArray(externalEvents.userId, userIds),
        or(gt(externalEvents.updatedAt, since), gt(externalEvents.deletedAt, since)),
      ),
    );

  const events: ExternalEvent[] = [];
  for (const row of eventRows) {
    const calendar = calendarsById.get(row.calendarId);
    if (!calendar) continue;
    const owner = row.userId === viewerId;
    const stored: StoredExternalEvent = {
      id: row.id,
      calendarId: row.calendarId,
      userId: row.userId,
      googleEventId: row.googleEventId,
      icalUid: row.icalUid,
      title: row.title,
      description: row.description,
      location: row.location,
      startAt: iso(row.startAt),
      endAt: iso(row.endAt),
      startDate: row.startDate,
      endDate: row.endDate,
      isAllDay: row.isAllDay,
      status: row.status as StoredExternalEvent['status'],
      transparency: row.transparency as StoredExternalEvent['transparency'],
      myResponse: row.myResponse as ExternalResponse | null,
      googleVisibility: row.googleVisibility as GoogleEventVisibility | null,
      visibilityOverride: row.visibilityOverride as ExternalVisibilityOverride,
      htmlLink: row.htmlLink,
      isRecurringInstance: row.isRecurringInstance,
      highlighted: row.highlighted,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      deletedAt: iso(row.deletedAt),
    };
    // A disabled or removed calendar hides everything from the partner, whatever the rows say.
    const calendarGone = calendar.deletedAt !== null || !calendar.syncEnabled || calendar.confirmedAt === null;
    const effective: ExternalVisibility = calendarGone
      ? 'private'
      : resolveEffectiveVisibility({
          calendarVisibility: calendar.visibility as ExternalVisibility,
          visibilityOverride: stored.visibilityOverride,
          googleVisibility: stored.googleVisibility,
          myResponse: stored.myResponse,
          accessRole: calendar.accessRole as GoogleAccessRole | null,
        });
    events.push(redactExternalEvent(stored, effective, owner));
  }

  const calendars: ExternalCalendar[] = calendarRows
    .filter((c) => c.updatedAt > since || (c.deletedAt !== null && c.deletedAt > since))
    // The partner never learns about a calendar that was never confirmed.
    .filter((c) => c.userId === viewerId || c.confirmedAt !== null)
    .map((c) =>
      redactExternalCalendar(
        {
          id: c.id,
          userId: c.userId,
          name: c.name,
          color: c.color,
          timeZone: c.timeZone,
          accessRole: c.accessRole as GoogleAccessRole | null,
          syncEnabled: c.syncEnabled,
          visibility: c.visibility as ExternalVisibility,
          lastSyncedAt: iso(c.lastSyncedAt),
          lastError: c.lastError,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          deletedAt: iso(c.deletedAt),
        },
        c.userId === viewerId,
      ),
    );

  return { externalCalendars: calendars, externalEvents: events };
}
