import { z } from 'zod';
import type { SyncEntityName, MutationOperation } from '@diade/domain';

// --- Identity & Space Schemas ---

export const createSpaceSchema = z.object({
  name: z.string().min(1, 'Space name is required').max(100),
});

export const joinSpaceSchema = z.object({
  inviteCode: z.string().min(6, 'Invite code must be at least 6 characters').max(32),
});

export const createInviteSchema = z.object({
  expiresInDays: z.number().int().positive().default(7),
});

// --- Visibility ---

export const visibilitySchema = z.enum(['shared', 'personal']);

// --- Calendar & Events Schemas ---

export const eventCategorySchema = z.enum(['general', 'important_date']);

export const createEventSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).nullable().optional(),
  startAt: z.string().datetime({ message: 'Must be valid ISO date string' }),
  endAt: z.string().datetime({ message: 'Must be valid ISO date string' }),
  isAllDay: z.boolean().default(false),
  visibility: visibilitySchema.default('shared'),
  recurrenceRule: z.string().max(255).nullable().optional(),
  category: eventCategorySchema.default('general'),
});

export const updateEventSchema = createEventSchema.partial().extend({
  id: z.string().uuid(),
});

// --- Tasks & Reminders Schemas ---

export const taskStatusSchema = z.enum(['todo', 'completed']);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // null = both members. User ids come from Better Auth and are not UUIDs.
  assigneeId: z.string().min(1).max(64).nullable().optional(),
  visibility: visibilitySchema.default('shared'),
  status: taskStatusSchema.default('todo'),
  completedAt: z.string().datetime().nullable().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().uuid(),
});

// --- Lists & Shopping Schemas ---

export const listCategorySchema = z.enum([
  'groceries',
  'pharmacy',
  'packing',
  'household',
  'other',
]);

export const createListSchema = z.object({
  name: z.string().min(1, 'List name is required').max(100),
  icon: z.string().max(50).nullable().optional(),
  category: listCategorySchema.default('groceries'),
});

export const updateListSchema = createListSchema.partial().extend({
  id: z.string().uuid(),
});

export const createListItemSchema = z.object({
  listId: z.string().uuid(),
  name: z.string().min(1, 'Item name is required').max(200),
  quantity: z.string().max(50).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const updateListItemSchema = createListItemSchema.partial().extend({
  id: z.string().uuid(),
  isChecked: z.boolean().optional(),
});

export const toggleListItemSchema = z.object({
  isChecked: z.boolean(),
});

// --- Quick Capture Schemas ---

export const captureTypeSchema = z.enum(['text', 'voice', 'link', 'image']);
export const captureStatusSchema = z.enum(['inbox', 'processed', 'archived']);

export const createCaptureItemSchema = z.object({
  content: z.string().min(1, 'Content is required').max(5000),
  captureType: captureTypeSchema.default('text'),
});

export const updateCaptureItemSchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(5000).optional(),
  status: captureStatusSchema.optional(),
});

// --- Sync & Mutation Schemas ---

export const syncEntityNameSchema = z.enum([
  'events',
  'tasks',
  'lists',
  'list_items',
  'capture_items',
]);

export const mutationOperationSchema = z.enum(['INSERT', 'UPDATE', 'DELETE']);

export const clientMutationSchema = z.object({
  id: z.string().uuid('Mutation ID must be a UUID (idempotency key)'),
  entity: syncEntityNameSchema,
  operation: mutationOperationSchema,
  recordId: z.string().uuid('Record ID must be a valid UUID'),
  payload: z.record(z.string(), z.unknown()),
  clientTimestamp: z.number().int().positive(),
});

export const syncPushSchema = z.object({
  mutations: z.array(clientMutationSchema).min(1).max(250),
});

export const syncPullQuerySchema = z.object({
  since: z.string().datetime().optional(), // ISO timestamp cursor; omitted on initial full sync
});

// --- Sync Payload Schemas (per entity and operation) ---
//
// INSERT payloads may use create* schemas (defaults apply). UPDATE payloads must
// not use defaults: a missing field means "unchanged", not "reset to default".
// The server validates every mutation with these before touching the database.

const isoDateTime = z.string().datetime({ message: 'Must be valid ISO date string' });

const eventUpdatePayload = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  startAt: isoDateTime.optional(),
  endAt: isoDateTime.optional(),
  isAllDay: z.boolean().optional(),
  visibility: visibilitySchema.optional(),
  recurrenceRule: z.string().max(255).nullable().optional(),
  category: eventCategorySchema.optional(),
});

const taskUpdatePayload = z.object({
  title: z.string().min(1).max(255).optional(),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: isoDateTime.nullable().optional(),
  assigneeId: z.string().min(1).max(64).nullable().optional(),
  visibility: visibilitySchema.optional(),
  status: taskStatusSchema.optional(),
  completedAt: isoDateTime.nullable().optional(),
});

const listUpdatePayload = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).nullable().optional(),
  category: listCategorySchema.optional(),
});

const listItemUpdatePayload = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.string().max(50).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isChecked: z.boolean().optional(),
});

const captureItemUpdatePayload = z.object({
  content: z.string().min(1).max(5000).optional(),
  status: captureStatusSchema.optional(),
});

export const syncPayloadSchemas = {
  events: { INSERT: createEventSchema, UPDATE: eventUpdatePayload },
  tasks: {
    INSERT: createTaskSchema.extend({ completedAt: isoDateTime.nullable().optional() }),
    UPDATE: taskUpdatePayload,
  },
  lists: { INSERT: createListSchema, UPDATE: listUpdatePayload },
  list_items: {
    INSERT: createListItemSchema.extend({ isChecked: z.boolean().optional() }),
    UPDATE: listItemUpdatePayload,
  },
  capture_items: {
    INSERT: createCaptureItemSchema,
    UPDATE: captureItemUpdatePayload,
  },
} as const;

/** DELETE mutations carry no payload; everything else must match its entity schema. */
export function parseSyncPayload(
  entity: SyncEntityName,
  operation: MutationOperation,
  payload: Record<string, unknown>,
): { success: true; data: Record<string, unknown> } | { success: false; message: string } {
  if (operation === 'DELETE') return { success: true, data: {} };
  const schema = syncPayloadSchemas[entity][operation === 'INSERT' ? 'INSERT' : 'UPDATE'];
  const result = schema.safeParse(payload);
  if (result.success) return { success: true, data: result.data as Record<string, unknown> };
  return {
    success: false,
    message: result.error.issues.map((i) => `${i.path.join('.') || 'payload'}: ${i.message}`).join('; '),
  };
}
