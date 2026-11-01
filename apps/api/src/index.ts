import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import type { HealthResponse } from '@diade/contracts';
import { createDb, type DbClient } from './db';
import { createAuth, type AuthInstance } from './auth';
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
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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

export default Sentry.withSentry(
  (env: AppEnv['Bindings'] | undefined) => ({
    dsn: env?.SENTRY_DSN,
    environment: env?.ENVIRONMENT ?? 'development',
    tracesSampleRate: env?.ENVIRONMENT === 'production' ? 0.1 : 1.0,
  }),
  app,
);
