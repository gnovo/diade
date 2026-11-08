/**
 * Díade Domain Model & Core Types
 */

export * from './datetime';
export * from './externalCalendar';
export * from './importantDates';
export * from './ingredientCatalog';
export * from './ingredientDictionary';
export * from './ingredientKeys';
export * from './ingredientNames';
export * from './listTemplates';
export * from './mealPlan';
export * from './recipeMarkdown';
export * from './recipeSections';
export * from './recipes';
export * from './recurrence';

import type { ExternalCalendar, ExternalEvent } from './externalCalendar';
import type { ImportantDateRepeat, ImportantDateType } from './importantDates';
import type { Ingredient } from './ingredientCatalog';
import type { GroceryContribution, MealPlan } from './mealPlan';
import type { Recipe } from './recipes';

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
  /** Starred: featured on the Today screen. */
  highlighted: boolean;
}

// --- Important dates ---

/**
 * A special day for the couple. Always shared between both members, so it has no
 * visibility field. `date` is a plain `YYYY-MM-DD` calendar day, not an instant.
 */
export interface ImportantDate extends BaseRecord {
  title: string;
  type: ImportantDateType;
  notes: string | null;
  /** Who the date is about, for other people's birthdays and anniversaries. Null for the couple's own. */
  personName: string | null;
  date: string;
  /** Count the date itself as day 1 rather than day 0. */
  countFirstDay: boolean;
  repeat: ImportantDateRepeat;
  /** The one date featured at the top of the screen and on Today. At most one per space. */
  pinned: boolean;
  /** Days before the date to alert on (0 = on the day). Stored only; delivery is not built yet. */
  alertOffsetDays: number | null;
}

// --- Tasks & Reminders ---

export type TaskStatus = 'todo' | 'completed';
export const TASK_PRIORITIES = ['normal', 'important'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface Task extends BaseRecord {
  assigneeId: string | null; // null represents assigned to 'both'
  title: string;
  notes: string | null;
  dueDate: string | null; // ISO 8601
  status: TaskStatus;
  priority: TaskPriority;
  visibility: Visibility;
  completedAt: string | null;
}

// --- Lists & Shopping ---

export type ListCategory = 'groceries' | 'pharmacy' | 'packing' | 'household' | 'other';

export interface SharedList extends BaseRecord {
  name: string;
  icon: string | null;
  category: ListCategory;
  /** The meal plan this list was generated from, if any. */
  planId: string | null;
}

export interface ListItem {
  id: string;
  listId: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
  /** Manual order within the list. Null until the list is first reordered; nulls sort last. */
  position: number | null;
  /** What each recipe asked for, when the item came from a meal plan; null for ordinary items. */
  contributions: GroceryContribution[] | null;
  /** A member changed the name or quantity of a plan item, so "Update from plan" leaves it alone. */
  editedByHand: boolean;
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

export type SyncEntityName =
  | 'events'
  | 'tasks'
  | 'lists'
  | 'list_items'
  | 'capture_items'
  | 'important_dates'
  | 'recipes'
  | 'meal_plans'
  | 'ingredients';
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

export interface RejectedMutation {
  id: string;
  code: 'INVALID_PAYLOAD' | 'FORBIDDEN' | 'APPLY_FAILED';
  message: string;
}

export interface SyncPushResult {
  processedCount: number;
  appliedMutationIds: string[];
  /** Mutations the server will never accept; clients must drop them from the outbox. */
  rejectedMutations: RejectedMutation[];
  serverTimestamp: string;
}

export interface SyncPullResult {
  cursor: string; // ISO timestamp
  events: CalendarEvent[];
  tasks: Task[];
  lists: SharedList[];
  listItems: ListItem[];
  captureItems: CaptureItem[];
  importantDates: ImportantDate[];
  /** Absent from an API that predates recipes. */
  recipes?: Recipe[];
  /** Absent from an API that predates meal plans. */
  mealPlans?: MealPlan[];
  /** Absent from an API that predates the ingredient catalog. */
  ingredients?: Ingredient[];
  /** Absent from an API that predates Google Calendar sync. */
  externalCalendars?: ExternalCalendar[];
  externalEvents?: ExternalEvent[];
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

export function isTaskAssignedToUser(task: { assigneeId: string | null }, userId: string): boolean {
  // null means assigned to both members
  return task.assigneeId === null || task.assigneeId === userId;
}
