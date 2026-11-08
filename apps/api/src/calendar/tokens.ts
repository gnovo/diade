import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import type { DbClient } from '../db';
import { accounts } from '../db/schema';
import { type FetchFn, GoogleAuthError, refreshGoogleAccessToken } from './google';

export interface TokenEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
}

/** Refresh this long before the token actually expires. */
const EXPIRY_MARGIN_MS = 60_000;

/** Matches Better Auth's own check for an encrypted value (bare hex, or `$ba$` envelope). */
const looksEncrypted = (value: string) =>
  value.startsWith('$ba$') || (value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value));

/**
 * Better Auth encrypts OAuth tokens (`account.encryptOAuthTokens`) with BETTER_AUTH_SECRET.
 * Rows written before that was turned on are plaintext and are read as they are.
 * Does not support Better Auth's `secrets` rotation array; this app uses a single secret.
 */
export async function decryptToken(value: string | null, secret: string): Promise<string | null> {
  if (!value) return null;
  if (!looksEncrypted(value)) return value;
  return symmetricDecrypt({ key: secret, data: value });
}

export async function encryptToken(value: string, secret: string): Promise<string> {
  return symmetricEncrypt({ key: secret, data: value });
}

export const parseScopes = (scope: string | null | undefined): string[] =>
  (scope ?? '').split(/[\s,]+/).filter(Boolean);

export function hasScopes(scope: string | null | undefined, required: readonly string[]): boolean {
  const granted = new Set(parseScopes(scope));
  return required.every((s) => granted.has(s));
}

/**
 * Returns a valid Google access token for the account, refreshing and persisting it when
 * it is missing, close to expiry, or `forceRefresh` is set. Throws `GoogleAuthError` when
 * the member must reconnect.
 */
export async function getGoogleAccessToken(
  db: DbClient,
  env: TokenEnv,
  accountId: string,
  options: { forceRefresh?: boolean; fetchFn?: FetchFn; now?: Date } = {},
): Promise<string> {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured');
  const [account] = await db.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
  if (!account) throw new GoogleAuthError('Google account not found');

  const now = options.now ?? new Date();
  const accessToken = await decryptToken(account.accessToken, secret);
  const stillValid =
    accessToken &&
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > now.getTime();
  if (stillValid && !options.forceRefresh) return accessToken;

  const refreshToken = await decryptToken(account.refreshToken, secret);
  if (!refreshToken) throw new GoogleAuthError('No Google refresh token stored');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured');
  }

  const refreshed = await refreshGoogleAccessToken(
    { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken },
    options.fetchFn,
  );

  await db
    .update(accounts)
    .set({
      accessToken: await encryptToken(refreshed.accessToken, secret),
      accessTokenExpiresAt: new Date(now.getTime() + refreshed.expiresIn * 1000),
      ...(refreshed.refreshToken
        ? { refreshToken: await encryptToken(refreshed.refreshToken, secret) }
        : {}),
      updatedAt: now,
    })
    .where(eq(accounts.id, accountId));

  return refreshed.accessToken;
}
