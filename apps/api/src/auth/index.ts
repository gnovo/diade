import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import { expo } from '@better-auth/expo';
import type { DbClient } from '../db';
import * as schema from '../db/schema';

/** Native app deep-link scheme (apps/mobile/app.json `scheme`). Trusted for OAuth callbacks. */
export const APP_SCHEME = 'diade://';
/** Expo Go development scheme. Matches any exp:// host because no authority is given. */
export const EXPO_GO_SCHEME = 'exp://';

export interface AuthEnv {
  ENVIRONMENT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
}

/**
 * Díade has exactly two members. Social sign-in (Google) creates a user on first login,
 * and `disableSignUp` only covers email sign-up, so new user creation is restricted here.
 */
export const ALLOWED_EMAILS: readonly string[] = [
  'gfnovo@gmail.com',
  'ana.monica.serrao@gmail.com',
];

export function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && ALLOWED_EMAILS.includes(email.trim().toLowerCase());
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
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isAllowedEmail(user.email)) {
              return false; // block creation of any other account
            }
            return { data: { ...user, email: user.email.trim().toLowerCase() } };
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET || 'dev-secret-replace-in-production-must-be-32-chars-long',
    baseURL: env.BETTER_AUTH_URL || 'http://localhost:8787',
    // Email and password sign-in is off: Google is the only way in.
    emailAndPassword: { enabled: false },
    // Expo Go returns to exp://<dev-server>. The plugin only trusts that under NODE_ENV=development,
    // which Workers do not set, so trust it explicitly outside production.
    trustedOrigins: [APP_SCHEME, ...(env.ENVIRONMENT === 'production' ? [] : [EXPO_GO_SCHEME])],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID || 'dummy-google-client-id',
        clientSecret: env.GOOGLE_CLIENT_SECRET || 'dummy-google-client-secret',
      },
    },
    plugins: [
      bearer(), // Enables 'Authorization: Bearer <token>' for React Native mobile client
      expo(), // Browser-based Google sign-in that returns to the app via the diade:// scheme
    ],
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
