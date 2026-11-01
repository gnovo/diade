/**
 * Díade Domain Model & Core Types
 */

// --- Identity & Space ---

export type SpaceRole = 'owner' | 'member';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Space {
  id: string;
  name: string;
  inviteCode: string;
  inviteExpiresAt: string | null;
  createdAt: string;
}

export interface SpaceMember {
  id: string;
  spaceId: string;
  userId: string;
  role: SpaceRole;
  joinedAt: string;
  user?: User;
}

// --- Common Concepts ---

export type Visibility = 'shared' | 'personal';

export interface BaseRecord {
  id: string;
  spaceId: string;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// --- Calendar & Events ---

export type EventCategory = 'general' | 'important_date';

export interface CalendarEvent extends BaseRecord {
  title: string;
  description: string | null;
  startAt: string; // ISO 8601
  endAt: string; // ISO 8601
  isAllDay: boolean;
  visibility: Visibility;
  recurrenceRule: string | null; // iCal RRULE format
  category: EventCategory;
}

// --- Tasks & Reminders ---

export type TaskStatus = 'todo' | 'completed';

export interface Task extends BaseRecord {
  assigneeId: string | null; // null represents assigned to 'both'
  title: string;
  notes: string | null;
  dueDate: string | null; // ISO 8601
  status: TaskStatus;
  visibility: Visibility;
  completedAt: string | null;
}

// --- Lists & Shopping ---

export type ListCategory = 'groceries' | 'pharmacy' | 'packing' | 'household' | 'other';

export interface SharedList extends BaseRecord {
  name: string;
  icon: string | null;
  category: ListCategory;
}

export interface ListItem {
  id: string;
  listId: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
  isChecked: boolean;
  checkedBy: string | null;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// --- Quick Capture ---

export type CaptureType = 'text' | 'voice' | 'link' | 'image';
export type CaptureStatus = 'inbox' | 'processed' | 'archived';

export interface CaptureItem extends BaseRecord {
  content: string;
  captureType: CaptureType;
  status: CaptureStatus;
}

// --- Sync & Mutation Protocol ---

export type SyncEntityName = 'events' | 'tasks' | 'lists' | 'list_items' | 'capture_items';
export type MutationOperation = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ClientMutation {
  id: string; // Client-generated UUID (Idempotency key)
  entity: SyncEntityName;
  operation: MutationOperation;
  recordId: string;
  payload: Record<string, unknown>;
  clientTimestamp: number;
}

export interface SyncPushPayload {
  mutations: ClientMutation[];
}

export interface SyncPushResult {
  processedCount: number;
  appliedMutationIds: string[];
  serverTimestamp: string;
}

export interface SyncPullResult {
  cursor: string; // ISO timestamp
  events: CalendarEvent[];
  tasks: Task[];
  lists: SharedList[];
  listItems: ListItem[];
  captureItems: CaptureItem[];
}

// --- Domain Permission Helpers ---

export function canAccessRecord(
  record: { visibility: Visibility; creatorId: string },
  currentUserId: string,
): boolean {
  if (record.visibility === 'shared') {
    return true;
  }
  return record.creatorId === currentUserId;
}

export function isTaskAssignedToUser(
  task: { assigneeId: string | null },
  userId: string,
): boolean {
  // null means assigned to both members
  return task.assigneeId === null || task.assigneeId === userId;
}
