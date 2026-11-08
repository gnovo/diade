import type {
  CalendarConnectionResponse,
  CalendarSyncResponse,
  ConfirmCalendarsRequest,
  CreateInviteRequest,
  CreateSpaceRequest,
  CurrentSpaceResponse,
  HealthResponse,
  InviteCodeResponse,
  JoinSpaceRequest,
  SyncPullResult,
  SyncPushPayload,
  SyncPushResult,
  UpdateCalendarRequest,
  UpdateExternalEventRequest,
} from '@diade/contracts';

/** The user shape Better Auth returns; the app maps it to the domain User. */
export interface AuthUserResponse {
  id: string;
  email: string;
  name: string;
  image: string | null;
  createdAt: string;
}

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken?: () => Promise<string | null>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class DiadeApiClient {
  private baseUrl: string;
  private getAuthToken?: () => Promise<string | null>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getAuthToken = config.getAuthToken;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const headers = new Headers(options.headers);

    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    if (this.getAuthToken) {
      const token = await this.getAuthToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    // Native clients authenticate with the bearer token only. Omitting credentials stops the
    // platform cookie jar from attaching a session cookie, which Better Auth's origin check
    // would then reject for requests that carry no Origin header.
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'omit',
    });

    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const body = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const errorData = isJson ? (body as any).error : null;
      throw new ApiError(
        errorData?.message || response.statusText || 'API request failed',
        response.status,
        errorData?.code || 'UNKNOWN_ERROR',
        errorData?.details,
      );
    }

    // Díade endpoints wrap payloads as { success: true, data }. Return the payload, so callers
    // receive e.g. CurrentSpaceResponse directly. Non-wrapped responses (health, Better Auth) pass through.
    if (
      isJson &&
      body &&
      typeof body === 'object' &&
      (body as { success?: unknown }).success === true &&
      'data' in body
    ) {
      return (body as { data: T }).data;
    }
    return body as T;
  }

  // --- Health ---

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  /** Returns the signed-in user, or null when the stored token is no longer valid. */
  async getSessionUser(): Promise<AuthUserResponse | null> {
    const body = await this.request<{ user: AuthUserResponse } | null>('/api/auth/get-session');
    return body?.user ?? null;
  }

  async signOutSession(): Promise<void> {
    await this.request('/api/auth/sign-out', { method: 'POST', body: '{}' });
  }

  // --- Space Management ---

  async createSpace(data: CreateSpaceRequest): Promise<CurrentSpaceResponse> {
    return this.request<CurrentSpaceResponse>('/api/spaces', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCurrentSpace(): Promise<CurrentSpaceResponse> {
    return this.request<CurrentSpaceResponse>('/api/spaces/current');
  }

  async joinSpace(data: JoinSpaceRequest): Promise<CurrentSpaceResponse> {
    return this.request<CurrentSpaceResponse>('/api/spaces/join', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createInviteCode(data: CreateInviteRequest = {}): Promise<InviteCodeResponse> {
    return this.request<InviteCodeResponse>('/api/spaces/invite', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Sync Engine ---

  async syncPush(payload: SyncPushPayload): Promise<SyncPushResult> {
    return this.request<SyncPushResult>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async syncPull(since?: string): Promise<SyncPullResult> {
    const query = since ? `?since=${encodeURIComponent(since)}` : '';
    return this.request<SyncPullResult>(`/api/sync/pull${query}`);
  }

  // --- Google Calendar ---

  async getCalendarConnection(): Promise<CalendarConnectionResponse> {
    return this.request<CalendarConnectionResponse>('/api/calendar/connection');
  }

  /** Re-reads the member's calendar list from Google (used right after connecting). */
  async refreshCalendarList(): Promise<CalendarConnectionResponse> {
    return this.request<CalendarConnectionResponse>('/api/calendar/connection/refresh-calendars', {
      method: 'POST',
      body: '{}',
    });
  }

  async confirmCalendars(data: ConfirmCalendarsRequest): Promise<{ started: boolean }> {
    return this.request<{ started: boolean }>('/api/calendar/calendars/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCalendar(
    id: string,
    data: UpdateCalendarRequest,
  ): Promise<Pick<CalendarConnectionResponse, 'calendars'>> {
    return this.request(`/api/calendar/calendars/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updateExternalEvent(
    id: string,
    data: UpdateExternalEventRequest,
  ): Promise<{ updated: boolean }> {
    return this.request<{ updated: boolean }>(`/api/calendar/events/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async syncCalendars(): Promise<CalendarSyncResponse> {
    return this.request<CalendarSyncResponse>('/api/calendar/sync', { method: 'POST', body: '{}' });
  }

  async disconnectCalendar(): Promise<{ disconnected: boolean }> {
    return this.request<{ disconnected: boolean }>('/api/calendar/connection', {
      method: 'DELETE',
    });
  }
}
