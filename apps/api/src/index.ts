import type { HealthResponse } from '@diade/contracts';
import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { type AuthInstance, createAuth } from './auth';
import { syncDueCalendars } from './calendar/service';
import { mirrorTraining } from './calendar/trainingMirror';
import { createDb, type DbClient } from './db';
import { createCalendarRouter } from './routes/calendar';
import { createSpacesRouter } from './routes/spaces';
import { createSyncRouter } from './routes/sync';

export interface AppEnv {
  Bindings: {
    HYPERDRIVE?: {
      connectionString: string;
    };
    DATABASE_URL?: string;
    ENVIRONMENT?: string;
    SENTRY_DSN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
  };
  Variables: {
    db: DbClient;
    auth: AuthInstance;
  };
}

const app = new Hono<AppEnv>();

// Global Middleware
app.use('*', logger());
app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
);

// GET /health - Public Health Check (Independent of DB status)
app.get('/health', (c) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: c.env?.ENVIRONMENT || 'development',
    version: '0.1.0',
  };
  return c.json(response);
});

// Lazy-initialization middleware for DB & Better Auth (Scoped to /api/*)
app.use('/api/*', async (c, next) => {
  if (!c.get('db')) {
    const env = c.env || {};
    const db = createDb(env);
    c.set('db', db);
    c.set('auth', createAuth(db, env));
  }
  await next();
});

// Better Auth Route Handler (/api/auth/*)
app.on(['POST', 'GET'], '/api/auth/**', (c) => {
  const auth = c.get('auth');
  return auth.handler(c.req.raw);
});

// Spaces Route Mount
app.route(
  '/api/spaces',
  createSpacesRouter(
    (c) => c.get('db'),
    (c) => c.get('auth'),
  ),
);

// Sync Engine Route Mount
app.route(
  '/api/sync',
  createSyncRouter(
    (c) => c.get('db'),
    (c) => c.get('auth'),
    // A changed event may be a training block: copy the blocks to Google after the response, on a connection of
    // its own (the request's may be closed by then). It does nothing for a member who has not turned it on.
    (c, userId, entities) => {
      if (!entities.has('events')) return;
      const env = (c.env || {}) as AppEnv['Bindings'];
      const run = Promise.resolve()
        .then(() => mirrorTraining({ db: createDb(env), env }, userId))
        .catch((err) => console.error('[training mirror]', err));
      try {
        c.executionCtx.waitUntil(run);
      } catch {
        // No execution context (tests): the promise runs on its own.
      }
    },
  ),
);

// Google Calendar connection and settings
app.route(
  '/api/calendar',
  createCalendarRouter(
    (c) => c.get('db'),
    (c) => c.get('auth'),
    (c) => c.env || {},
  ),
);

// Global Error Handler
app.onError((err, c) => {
  console.error('[API Error]:', err);
  Sentry.captureException(err);
  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: err.message || 'An unexpected error occurred',
      },
    },
    500,
  );
});

// 404 Not Found Handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    },
    404,
  );
});

// Cron (wrangler.jsonc `triggers.crons`): keeps every member's Google calendars fresh.
async function scheduled(_controller: ScheduledController, env: AppEnv['Bindings']): Promise<void> {
  const outcomes = await syncDueCalendars({ db: createDb(env), env });
  const errors = outcomes.filter((o) => o.status === 'error').length;
  console.log(`[calendar] cron synced ${outcomes.length} calendar(s), ${errors} error(s)`);
}

// Hono's app already exposes `fetch`; attaching `scheduled` keeps `app.request` usable in tests.
const worker = Object.assign(app, { scheduled });

export default Sentry.withSentry(
  (env: AppEnv['Bindings'] | undefined) => ({
    dsn: env?.SENTRY_DSN,
    environment: env?.ENVIRONMENT ?? 'development',
    tracesSampleRate: env?.ENVIRONMENT === 'production' ? 0.1 : 1.0,
  }),
  worker,
);
