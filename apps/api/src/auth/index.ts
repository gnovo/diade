import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins';
import type { DbClient } from '../db';
import * as schema from '../db/schema';

export interface AuthEnv {
  /** Set to "true" only while creating the two accounts; sign-up is closed otherwise. */
  ALLOW_SIGN_UP?: string;
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
    emailAndPassword: {
      enabled: true,
      // Díade has exactly two members and no public registration (handover §2).
      disableSignUp: env.ALLOW_SIGN_UP !== 'true',
      minPasswordLength: 12,
    },
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
