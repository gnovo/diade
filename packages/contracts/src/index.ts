import type {
  User,
  Space,
  SpaceMember,
  SyncPushPayload,
  SyncPushResult,
  SyncPullResult,
} from '@diade/domain';

// --- Common API Responses ---

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// --- Health Check ---

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  environment: string;
  version: string;
}

// --- Space Contracts ---

export interface CreateSpaceRequest {
  name: string;
}

export interface JoinSpaceRequest {
  inviteCode: string;
}

export interface CreateInviteRequest {
  expiresInDays?: number;
}

export interface CurrentSpaceResponse {
  space: Space;
  members: (SpaceMember & { user: User })[];
  role: 'owner' | 'member';
}

export interface InviteCodeResponse {
  inviteCode: string;
  expiresAt: string | null;
}

// --- Sync Contracts ---

export type { SyncPushPayload, SyncPushResult, SyncPullResult };

export interface SyncPullParams {
  since?: string; // ISO 8601 string
}
