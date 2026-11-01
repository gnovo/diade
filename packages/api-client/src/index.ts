import type {
  HealthResponse,
  CurrentSpaceResponse,
  CreateSpaceRequest,
  JoinSpaceRequest,
  InviteCodeResponse,
  CreateInviteRequest,
  SyncPushPayload,
  SyncPushResult,
  SyncPullResult,
} from '@diade/contracts';

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

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
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

    const response = await fetch(url, {
      ...options,
      headers,
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

    return body as T;
  }

  // --- Health ---

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
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
}
