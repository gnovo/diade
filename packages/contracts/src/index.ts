import type {
  ExternalCalendar,
  ExternalVisibility,
  NutritionTargets,
  Space,
  SpaceMember,
  SyncPullResult,
  SyncPushPayload,
  SyncPushResult,
  TrainingSettings,
  User,
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

/** The signed-in member's own nutrition settings. The partner's are never returned. */
export interface NutritionSettings {
  enabled: boolean;
  targets: NutritionTargets | null;
}

export interface UpdateNutritionSettingsRequest {
  enabled?: boolean;
  targets?: NutritionTargets | null;
}

/** The signed-in member's own training settings, or null until set. */
export interface TrainingSettingsResponse {
  training: TrainingSettings | null;
}

/** Whether the member's training blocks are copied to their Google calendar "Díade · Treino". */
export interface TrainingCalendarStatus {
  enabled: boolean;
  /** Whether the Google grant includes the training scope; false means connecting again. */
  canWrite: boolean;
  blocks: number;
  lastError: 'needs_reauth' | 'failed' | null;
  syncedAt: string | null;
}

export interface InviteCodeResponse {
  inviteCode: string;
  expiresAt: string | null;
}

// --- Sync Contracts ---

export type { SyncPullResult, SyncPushPayload, SyncPushResult };

export interface SyncPullParams {
  since?: string; // ISO 8601 string
}

// --- Google Calendar Contracts (see docs/architecture/calendar-sync-v1.md) ---

export interface CalendarConnectionResponse {
  /** The member has granted calendar access and a refresh token is stored. */
  connected: boolean;
  /** The grant was revoked or expired; the member must reconnect. */
  needsReauth: boolean;
  /** The member has confirmed the calendar picker at least once. */
  confirmed: boolean;
  calendars: ExternalCalendar[];
}

export interface UpdateCalendarRequest {
  syncEnabled?: boolean;
  visibility?: ExternalVisibility;
}

export interface ConfirmCalendarsRequest {
  calendars: Array<{ id: string; syncEnabled: boolean; visibility: ExternalVisibility }>;
}

export interface UpdateExternalEventRequest {
  visibilityOverride?: 'busy_only' | 'private' | null;
  highlighted?: boolean;
}

export interface CalendarSyncResponse {
  synced: number;
  skipped: number;
  errors: Array<{ calendarId: string; error?: string }>;
}
