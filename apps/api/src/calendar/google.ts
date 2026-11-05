/**
 * Thin Google Calendar REST client. Read-only: Díade never writes to Google.
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
    return this.status === 429 || (this.status === 403 && /rateLimit|quota/i.test(this.reason ?? ''));
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

export interface GoogleDateTime {
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

export interface GoogleClient {
  listCalendars(): Promise<GoogleCalendarListEntry[]>;
  listEvents(calendarId: string, params: ListEventsParams): Promise<GoogleEventsPage>;
}

/**
 * `getAccessToken(true)` must return a freshly refreshed token. It is called once when
 * Google answers 401, which means the cached token expired early.
 */
export function createGoogleClient(
  getAccessToken: (forceRefresh?: boolean) => Promise<string>,
  fetchFn: FetchFn = fetch,
): GoogleClient {
  async function get<T>(path: string, query: Record<string, string | undefined>): Promise<T> {
    const url = new URL(`${API}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await getAccessToken(attempt > 0);
      const response = await fetchFn(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (response.status === 401 && attempt === 0) continue;
      if (response.status === 401) throw new GoogleAuthError('Google rejected the access token');
      if (!response.ok) throw await toApiError(response);
      return (await response.json()) as T;
    }
    throw new GoogleAuthError('Google rejected the access token');
  }

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
      const page = await get<{ items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        {
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
        },
      );
      return {
        items: page.items ?? [],
        nextPageToken: page.nextPageToken,
        nextSyncToken: page.nextSyncToken,
      };
    },
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
    throw new GoogleApiError(`Token refresh failed (${code || response.status})`, response.status, code);
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  return { accessToken: body.access_token, expiresIn: body.expires_in, refreshToken: body.refresh_token };
}

/** Revokes a token at Google. Best effort: failures are ignored by callers. */
export async function revokeGoogleToken(token: string, fetchFn: FetchFn = fetch): Promise<void> {
  await fetchFn('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }).toString(),
  });
}
