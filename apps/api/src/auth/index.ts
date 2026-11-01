import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { DbClient } from '../db';
import * as schema from '../db/schema';

export interface AuthEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
}

export function createAuth(db: DbClient, env: AuthEnv) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret: env.BETTER_AUTH_SECRET || 'dev-secret-replace-in-production-must-be-32-chars-long',
    baseURL: env.BETTER_AUTH_URL || 'http://localhost:8787',
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID || 'dummy-google-client-id',
        clientSecret: env.GOOGLE_CLIENT_SECRET || 'dummy-google-client-secret',
      },
    },
    plugins: [
      bearer(), // Enables 'Authorization: Bearer <token>' for React Native mobile client
    ],
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
