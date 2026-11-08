import type { ExternalCalendar, ExternalVisibility, GoogleAccessRole } from '@diade/domain';
import {
  confirmExternalCalendarsSchema,
  updateExternalCalendarSchema,
  updateExternalEventSchema,
} from '@diade/validation';
import { zValidator } from '@hono/zod-validator';
import { type Context, Hono } from 'hono';
import { GoogleApiError, GoogleAuthError } from '../calendar/google';
import {
  type CalendarDeps,
  confirmCalendars,
  disconnect,
  getConnection,
  refreshCalendarList,
  setEventHighlight,
  syncUserCalendars,
  updateCalendarSettings,
  updateEventOverride,
} from '../calendar/service';
import type { TokenEnv } from '../calendar/tokens';
import type { DbClient } from '../db';
import type { externalCalendars } from '../db/schema';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toCalendarDto(row: typeof externalCalendars.$inferSelect): ExternalCalendar {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    timeZone: row.timeZone,
    accessRole: row.accessRole as GoogleAccessRole | null,
    syncEnabled: row.syncEnabled,
    visibility: row.visibility as ExternalVisibility,
    lastSyncedAt: iso(row.lastSyncedAt),
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: iso(row.deletedAt),
  };
}

const fail = (
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 502,
  code: string,
  message: string,
) => c.json({ success: false, error: { code, message } }, status);

/**
 * Google Calendar connection and settings. These are server-owned records, so they are
 * plain REST calls (they need a connection) rather than outbox mutations. Every route acts
 * on the caller's own calendars; nothing here can touch the partner's.
 */
export function createCalendarRouter(
  getDb: (c: any) => DbClient,
  getAuth: (c: any) => any,
  getEnv: (c: any) => TokenEnv,
) {
  const router = new Hono<{ Variables: { user: { id: string; email: string; name: string } } }>();

  router.use('*', async (c, next) => {
    const session = await getAuth(c).api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return fail(c, 401, 'UNAUTHORIZED', 'Authentication required');
    c.set('user', session.user);
    await next();
  });

  const deps = (c: any): CalendarDeps => ({ db: getDb(c), env: getEnv(c) });

  /** Maps Google failures to a response the app can act on. */
  const googleFailure = (c: Context, err: unknown) => {
    if (err instanceof GoogleAuthError) {
      return fail(c, 403, 'CALENDAR_NEEDS_REAUTH', 'Reconnect Google Calendar to continue');
    }
    if (err instanceof GoogleApiError && err.isRateLimited) {
      return fail(
        c,
        502,
        'CALENDAR_RATE_LIMITED',
        'Google is limiting requests; try again shortly',
      );
    }
    throw err;
  };

  // GET /api/calendar/connection
  router.get('/connection', async (c) => {
    const state = await getConnection(getDb(c), c.get('user').id);
    return c.json({
      success: true,
      data: {
        connected: state.connected,
        needsReauth: state.needsReauth,
        confirmed: state.confirmed,
        calendars: state.calendars.map(toCalendarDto),
      },
    });
  });

  // POST /api/calendar/connection/refresh-calendars
  router.post('/connection/refresh-calendars', async (c) => {
    try {
      await refreshCalendarList(deps(c), c.get('user').id);
    } catch (err) {
      return googleFailure(c, err);
    }
    const state = await getConnection(getDb(c), c.get('user').id);
    return c.json({
      success: true,
      data: {
        connected: state.connected,
        needsReauth: state.needsReauth,
        confirmed: state.confirmed,
        calendars: state.calendars.map(toCalendarDto),
      },
    });
  });

  // POST /api/calendar/calendars/confirm: the picker's "Start syncing"
  router.post(
    '/calendars/confirm',
    zValidator('json', confirmExternalCalendarsSchema),
    async (c) => {
      const user = c.get('user');
      const { calendars } = c.req.valid('json');
      await confirmCalendars(deps(c), user.id, calendars);

      // Sync in the background so the button returns at once; the app picks the result up on its next pull.
      const run = syncUserCalendars(deps(c), user.id, { force: true }).catch((err) =>
        console.error('[calendar] first sync failed', err instanceof Error ? err.name : 'error'),
      );
      try {
        c.executionCtx.waitUntil(run);
      } catch {
        await run; // No execution context (tests, local runtimes): finish before responding.
      }
      return c.json({ success: true, data: { started: true } });
    },
  );

  // PATCH /api/calendar/calendars/:id
  router.patch('/calendars/:id', zValidator('json', updateExternalCalendarSchema), async (c) => {
    const user = c.get('user');
    const result = await updateCalendarSettings(
      deps(c),
      user.id,
      c.req.param('id'),
      c.req.valid('json'),
    );
    if (result === 'not_found') return fail(c, 404, 'NOT_FOUND', 'Calendar not found');

    // Turning a calendar on should show its events without waiting for the next cron tick.
    if (c.req.valid('json').syncEnabled === true) {
      const run = syncUserCalendars(deps(c), user.id, { force: true }).catch(() => undefined);
      try {
        c.executionCtx.waitUntil(run);
      } catch {
        await run;
      }
    }
    const state = await getConnection(getDb(c), user.id);
    return c.json({ success: true, data: { calendars: state.calendars.map(toCalendarDto) } });
  });

  // PATCH /api/calendar/events/:id : per-event visibility override (narrowing only) and highlight
  router.patch('/events/:id', zValidator('json', updateExternalEventSchema), async (c) => {
    const body = c.req.valid('json');
    const userId = c.get('user').id;
    const eventId = c.req.param('id');
    if (body.visibilityOverride !== undefined) {
      const result = await updateEventOverride(deps(c), userId, eventId, body.visibilityOverride);
      if (result === 'not_found') return fail(c, 404, 'NOT_FOUND', 'Event not found');
      if (result === 'too_wide') {
        return fail(
          c,
          409,
          'VISIBILITY_TOO_WIDE',
          'An event cannot be more visible than its calendar',
        );
      }
    }
    if (body.highlighted !== undefined) {
      const result = await setEventHighlight(deps(c), userId, eventId, body.highlighted);
      if (result === 'not_found') return fail(c, 404, 'NOT_FOUND', 'Event not found');
    }
    return c.json({ success: true, data: { updated: true } });
  });

  // POST /api/calendar/sync : on-demand (throttled per calendar)
  router.post('/sync', async (c) => {
    try {
      const outcomes = await syncUserCalendars(deps(c), c.get('user').id);
      return c.json({
        success: true,
        data: {
          synced: outcomes.filter((o) => o.status === 'synced').length,
          skipped: outcomes.filter((o) => o.status === 'skipped').length,
          errors: outcomes
            .filter((o) => o.status === 'error')
            .map((o) => ({ calendarId: o.calendarId, error: o.error })),
        },
      });
    } catch (err) {
      return googleFailure(c, err);
    }
  });

  // DELETE /api/calendar/connection
  router.delete('/connection', async (c) => {
    await disconnect(deps(c), c.get('user').id);
    return c.json({ success: true, data: { disconnected: true } });
  });

  return router;
}
