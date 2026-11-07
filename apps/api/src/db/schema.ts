import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  bigint,
  date,
  integer,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// --- Better Auth Tables ---

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  idToken: text('id_token'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Díade Spaces & Members ---

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  inviteCode: text('invite_code').notNull().unique(),
  inviteExpiresAt: timestamp('invite_expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const spaceMembers = pgTable('space_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'), // 'owner' | 'member'
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
});

// --- Core Organisation Tables ---

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  startAt: timestamp('start_at').notNull(),
  endAt: timestamp('end_at').notNull(),
  isAllDay: boolean('is_all_day').notNull().default(false),
  visibility: text('visibility').notNull().default('shared'), // 'shared' | 'personal'
  recurrenceRule: text('recurrence_rule'),
  category: text('category').notNull().default('general'), // 'general' | 'important_date'
  /** Starred: featured in the Highlights section of the Today screen, for both members. */
  highlighted: boolean('highlighted').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

/**
 * Special days for the couple (birthdays, anniversaries, ...). Always shared, so there
 * is no visibility column. `date` is a plain calendar day (no time zone).
 */
export const importantDates = pgTable(
  'important_dates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    spaceId: uuid('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: text('type').notNull().default('other'), // see IMPORTANT_DATE_TYPES in @diade/domain
    notes: text('notes'),
    /** Who the date is about, for other people's birthdays and anniversaries. */
    personName: text('person_name'),
    date: date('date', { mode: 'string' }).notNull(),
    countFirstDay: boolean('count_first_day').notNull().default(false),
    repeat: text('repeat').notNull().default('yearly'), // 'none' | 'yearly'
    pinned: boolean('pinned').notNull().default(false),
    alertOffsetDays: integer('alert_offset_days'), // null = no alert; stored only for now
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    // At most one live pinned date per space.
    uniqueIndex('important_dates_one_pinned_per_space')
      .on(table.spaceId)
      .where(sql`${table.pinned} AND ${table.deletedAt} IS NULL`),
  ],
);

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }), // null = both
  title: text('title').notNull(),
  notes: text('notes'),
  dueDate: timestamp('due_date'),
  status: text('status').notNull().default('todo'), // 'todo' | 'completed'
  priority: text('priority').notNull().default('normal'), // 'normal' | 'important'
  visibility: text('visibility').notNull().default('shared'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const lists = pgTable('lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  category: text('category').notNull().default('groceries'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const listItems = pgTable('list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  listId: uuid('list_id')
    .notNull()
    .references(() => lists.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  quantity: text('quantity'),
  unit: text('unit'),
  notes: text('notes'),
  /** Manual order within the list. Null until the list is first reordered; nulls sort last. */
  position: doublePrecision('position'),
  isChecked: boolean('is_checked').notNull().default(false),
  checkedBy: text('checked_by').references(() => users.id, { onDelete: 'set null' }),
  checkedAt: timestamp('checked_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const captureItems = pgTable('capture_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  captureType: text('capture_type').notNull().default('text'), // 'text' | 'voice' | 'link' | 'image'
  status: text('status').notNull().default('inbox'), // 'inbox' | 'processed' | 'archived'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

// --- Google Calendar sync (read-only) ---
// Server-owned: written only by the calendar sync engine, never through the sync outbox.
// See docs/architecture/calendar-sync-v1.md.

export const externalCalendars = pgTable(
  'external_calendars',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    googleCalendarId: text('google_calendar_id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    timeZone: text('time_zone'),
    accessRole: text('access_role'), // 'owner' | 'writer' | 'reader' | 'freeBusyReader'
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    visibility: text('visibility').notNull().default('shared'), // 'shared' | 'busy_only' | 'private'
    // Until the member confirms the calendar picker nothing syncs and nothing is shared.
    confirmedAt: timestamp('confirmed_at'),
    syncToken: text('sync_token'),
    windowStart: timestamp('window_start'),
    windowEnd: timestamp('window_end'),
    lastSyncedAt: timestamp('last_synced_at'),
    lastFullSyncAt: timestamp('last_full_sync_at'),
    lastError: text('last_error'),
    lockUntil: timestamp('lock_until'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('external_calendars_account_google_id').on(table.accountId, table.googleCalendarId),
    index('external_calendars_user').on(table.userId),
  ],
);

export const externalEvents = pgTable(
  'external_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    calendarId: uuid('calendar_id')
      .notNull()
      .references(() => externalCalendars.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    googleEventId: text('google_event_id').notNull(),
    icalUid: text('ical_uid'),
    title: text('title'),
    description: text('description'),
    location: text('location'),
    startAt: timestamp('start_at'),
    endAt: timestamp('end_at'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }), // inclusive
    isAllDay: boolean('is_all_day').notNull().default(false),
    status: text('status').notNull().default('confirmed'), // 'confirmed' | 'tentative'
    transparency: text('transparency').notNull().default('opaque'), // 'opaque' | 'transparent'
    myResponse: text('my_response'),
    googleVisibility: text('google_visibility'),
    visibilityOverride: text('visibility_override'), // null | 'busy_only' | 'private'
    /** Starred by the owner. Reaches the partner only while the event is shared in full. */
    highlighted: boolean('highlighted').notNull().default(false),
    htmlLink: text('html_link'),
    isRecurringInstance: boolean('is_recurring_instance').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('external_events_calendar_google_id').on(table.calendarId, table.googleEventId),
    index('external_events_user_updated').on(table.userId, table.updatedAt),
  ],
);

// --- Idempotency & Sync Tracking ---

export const syncMutations = pgTable('sync_mutations', {
  id: uuid('id').primaryKey(), // Client-generated mutation UUID
  spaceId: uuid('space_id')
    .notNull()
    .references(() => spaces.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  entity: text('entity').notNull(),
  operation: text('operation').notNull(),
  recordId: uuid('record_id').notNull(),
  clientTimestamp: bigint('client_timestamp', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
