import { GOOGLE_CALENDAR_SCOPES, GOOGLE_TRAINING_SCOPE } from '@diade/domain';
import { apiClient } from '../api/client';
import { authClient } from '../auth/authClient';

export type ConnectResult = { ok: true } | { ok: false; message: string | null };

/**
 * Asks Google for read-only calendar access, as an extra grant on the member's existing
 * Google account. Calendar scopes are never requested at sign-in; this runs only when the
 * member taps "Connect". `access_type=offline` with `prompt=consent` is what makes Google
 * issue the refresh token the server needs to sync in the background.
 *
 * The browser flow returns without saying whether the member approved, so success is
 * decided by asking the server what it now holds.
 */
export async function connectGoogleCalendar(): Promise<ConnectResult> {
  const result = await authClient.linkSocial({
    provider: 'google',
    scopes: [...GOOGLE_CALENDAR_SCOPES],
    callbackURL: '/',
    additionalParams: { access_type: 'offline', prompt: 'consent' },
  });
  if (result.error) return { ok: false, message: result.error.message ?? null };

  const connection = await apiClient.getCalendarConnection();
  return connection.connected ? { ok: true } : { ok: false, message: null };
}

/**
 * Asks Google for the extra grant that lets Díade create its own training calendar and write to it, together with
 * the read-only calendar access (asking for all of them at once keeps the stored grant complete). Success is decided
 * by asking the server.
 */
export async function connectGoogleTraining(): Promise<ConnectResult> {
  const result = await authClient.linkSocial({
    provider: 'google',
    scopes: [...GOOGLE_CALENDAR_SCOPES, GOOGLE_TRAINING_SCOPE],
    callbackURL: '/',
    additionalParams: { access_type: 'offline', prompt: 'consent' },
  });
  if (result.error) return { ok: false, message: result.error.message ?? null };
  const status = await apiClient.getTrainingCalendar();
  return status.canWrite ? { ok: true } : { ok: false, message: null };
}
