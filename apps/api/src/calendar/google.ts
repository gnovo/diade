/**
 * Thin Google Calendar REST client. It reads the member's calendars, and writes only to the one calendar Díade
 * creates for their training blocks (the `calendar.app.created` scope cannot reach any other).
 * Pure `fetch`, so it runs in Workers and can be tested with a stub.
 */

const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason?: string,
  ) {
    super(message);
    this.name = 'GoogleApiError';
  }

  /** The sync token or page token is no longer valid; start again with a full sync. */
  get isGone(): boolean {
    return this.status === 410;
  }

  /** Quota or rate limiting; try again at the next scheduled run. */
  get isRateLimited(): boolean {
    return (
      this.status === 429 || (this.status === 403 && /rateLimit|quota/i.test(this.reason ?? ''))
    );
  }
}

/** The member's grant is gone (revoked, expired or removed). They must reconnect. */
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

// --- Google resource shapes (only the fields we read) ---

export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  timeZone?: string;
  accessRole?: string;
  selected?: boolean;
  deleted?: boolean;
  primary?: boolean;
}

interface GoogleDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDateTime;
  end?: GoogleDateTime;
  iCalUID?: string;
  htmlLink?: string;
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  eventType?: string;
  recurringEventId?: string;
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
}

export interface GoogleEventsPage {
  items: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface ListEventsParams {
  syncToken?: string;
  timeMin?: Date;
  timeMax?: Date;
  pageToken?: string;
}

/** An event Díade writes: a timed, recurring block. */
export interface GoogleEventWrite {
  summary: string;
  description?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
  transparency: 'transparent' | 'opaque';
  visibility: 'private' | 'default';
  reminders: { useDefault: boolean };
  extendedProperties?: { private: Record<string, string> };
}

/** The reading half of the client: all the event sync needs. */
export type GoogleReader = Pick<GoogleClient, 'listCalendars' | 'listEvents'>;

export interface GoogleClient {
  listCalendars(): Promise<GoogleCalendarListEntry[]>;
  listEvents(calendarId: string, params: ListEventsParams): Promise<GoogleEventsPage>;
  /** Creates a secondary calendar owned by the app. */
  insertCalendar(summary: string, timeZone: string): Promise<{ id: string }>;
  /** Deletes a calendar the app created; one already gone counts as deleted. */
  deleteCalendar(calendarId: string): Promise<void>;
  insertEvent(calendarId: string, event: GoogleEventWrite): Promise<{ id: string }>;
  /** Replaces the fields given; a 404 or 410 means the event is gone (the member deleted it in Google). */
  patchEvent(calendarId: string, eventId: string, event: GoogleEventWrite): Promise<{ id: string }>;
  /** One already gone counts as deleted. */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
}

/**
 * `getAccessToken(true)` must return a freshly refreshed token. It is called once when
 * Google answers 401, which means the cached token expired early.
 */
export function createGoogleClient(
  getAccessToken: (forceRefresh?: boolean) => Promise<string>,
  fetchFn: FetchFn = fetch,
): GoogleClient {
  async function send<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    query: Record<string, string | undefined>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${API}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getAccessToken(attempt > 0);
      const response = await fetchFn(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 401) throw new GoogleAuthError('Google rejected the access token');
      if (!response.ok) throw await toApiError(response);
      // DELETE answers 204 with no body.
      return (response.status === 204 ? undefined : await response.json()) as T;
    }
    throw new GoogleAuthError('Google rejected the access token');
  }
  const get = <T>(path: string, query: Record<string, string | undefined>) =>
    send<T>('GET', path, query);
  /** A delete of something already gone is done. */
  const ignoreGone = (err: unknown) => {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  };
  const events = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;

  return {
    async listCalendars() {
      const all: GoogleCalendarListEntry[] = [];
      let pageToken: string | undefined;
      do {
        const page = await get<{ items?: GoogleCalendarListEntry[]; nextPageToken?: string }>(
          '/users/me/calendarList',
          { maxResults: '250', showHidden: 'true', showDeleted: 'false', pageToken },
        );
        all.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return all;
    },

    async listEvents(calendarId, params) {
      const page = await get<{
        items?: GoogleEvent[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>(`/calendars/${encodeURIComponent(calendarId)}/events`, {
        maxResults: '250',
        singleEvents: 'true',
        showDeleted: 'true',
        pageToken: params.pageToken,
        // Google rejects timeMin/timeMax together with a syncToken; the original window
        // stays in force for incremental requests.
        ...(params.syncToken
          ? { syncToken: params.syncToken }
          : {
              timeMin: params.timeMin?.toISOString(),
              timeMax: params.timeMax?.toISOString(),
            }),
      });
      return {
        items: page.items ?? [],
        nextPageToken: page.nextPageToken,
        nextSyncToken: page.nextSyncToken,
      };
    },

    insertCalendar: (summary, timeZone) =>
      send<{ id: string }>('POST', '/calendars', {}, { summary, timeZone }),

    deleteCalendar: (calendarId) =>
      send<void>('DELETE', `/calendars/${encodeURIComponent(calendarId)}`, {}).catch(ignoreGone),

    insertEvent: (calendarId, event) => send<{ id: string }>('POST', events(calendarId), {}, event),

    patchEvent: (calendarId, eventId, event) =>
      send<{ id: string }>(
        'PATCH',
        `${events(calendarId)}/${encodeURIComponent(eventId)}`,
        {},
        event,
      ),

    deleteEvent: (calendarId, eventId) =>
      send<void>('DELETE', `${events(calendarId)}/${encodeURIComponent(eventId)}`, {}).catch(
        ignoreGone,
      ),
  };
}

async function toApiError(response: Response): Promise<GoogleApiError> {
  let message = response.statusText || 'Google API request failed';
  let reason: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    message = body.error?.message ?? message;
    reason = body.error?.errors?.[0]?.reason;
  } catch {
    // Non-JSON error body; keep the status text.
  }
  return new GoogleApiError(message, response.status, reason);
}

export interface RefreshedToken {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Google only rotates the refresh token occasionally. */
  refreshToken?: string;
}

export async function refreshGoogleAccessToken(
  credentials: { clientId: string; clientSecret: string; refreshToken: string },
  fetchFn: FetchFn = fetch,
): Promise<RefreshedToken> {
  const response = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  if (!response.ok) {
    let code = '';
    try {
      code = ((await response.json()) as { error?: string }).error ?? '';
    } catch {
      // ignore
    }
    // `invalid_grant` means revoked, expired (testing-mode consent screens) or password reset.
    if (code === 'invalid_grant' || code === 'invalid_client' || code === 'unauthorized_client') {
      throw new GoogleAuthError(`Google refused the refresh token (${code})`);
    }
    throw new GoogleApiError(
      `Token refresh failed (${code || response.status})`,
      response.status,
      code,
    );
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    refreshToken: body.refresh_token,
  };
}

/** Revokes a token at Google. Best effort: failures are ignored by callers. */
export async function revokeGoogleToken(token: string, fetchFn: FetchFn = fetch): Promise<void> {
  await fetchFn('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  });
}
