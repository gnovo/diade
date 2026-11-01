import { z } from 'zod';

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
  assigneeId: z.string().uuid().nullable().optional(), // null = both members
  visibility: visibilitySchema.default('shared'),
  status: taskStatusSchema.default('todo'),
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
  payload: z.record(z.unknown()),
  clientTimestamp: z.number().int().positive(),
});

export const syncPushSchema = z.object({
  mutations: z.array(clientMutationSchema).min(1).max(250),
});

export const syncPullQuerySchema = z.object({
  since: z.string().datetime().optional(), // ISO timestamp cursor; omitted on initial full sync
});
