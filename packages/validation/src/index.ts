import { z } from 'zod';
import {
  EXTERNAL_VISIBILITIES,
  TASK_PRIORITIES,
  IMPORTANT_DATE_REPEATS,
  IMPORTANT_DATE_TYPES,
  RECIPE_UNITS,
  MIN_SERVINGS,
  MAX_SERVINGS,
  DEFAULT_SERVINGS,
  MAX_PLAN_RECIPES,
  parseDateOnly,
  type SyncEntityName,
  type MutationOperation,
} from '@diade/domain';

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
  highlighted: z.boolean().default(false),
});

export const updateEventSchema = createEventSchema.partial().extend({
  id: z.string().uuid(),
});

// --- Tasks & Reminders Schemas ---

export const taskStatusSchema = z.enum(['todo', 'completed']);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  // null = both members. User ids come from Better Auth and are not UUIDs.
  assigneeId: z.string().min(1).max(64).nullable().optional(),
  visibility: visibilitySchema.default('shared'),
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema.default('normal'),
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

/** What one recipe asked for of a generated item; see `GroceryContribution` in @diade/domain. */
export const groceryContributionSchema = z.object({
  recipeId: z.string().uuid(),
  recipeName: z.string().max(120),
  key: z.string().min(1).max(200),
  quantity: z.number().finite().nonnegative().max(1_000_000).nullable(),
  unit: z.enum(RECIPE_UNITS),
});

export const createListSchema = z.object({
  name: z.string().min(1, 'List name is required').max(100),
  icon: z.string().max(50).nullable().optional(),
  category: listCategorySchema.default('groceries'),
  /** The meal plan this list was generated from. */
  planId: z.string().uuid().nullable().optional(),
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
  /** Manual order within the list; items without one sort after those with one. */
  position: z.number().finite().nullable().optional(),
  /** What each recipe asked for, when the item was generated from a meal plan. */
  contributions: z.array(groceryContributionSchema).max(50).nullable().optional(),
  /** Set when a member changes a plan item, so "Update from plan" leaves it alone. */
  editedByHand: z.boolean().optional(),
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

// --- Important Dates Schemas ---
//
// Important dates are always shared between both members, so there is deliberately no
// visibility field: a client that sends one has it stripped by validation.

export const importantDateTypeSchema = z.enum(IMPORTANT_DATE_TYPES);
export const importantDateRepeatSchema = z.enum(IMPORTANT_DATE_REPEATS);

/** A real calendar day as `YYYY-MM-DD` (rejects 2026-02-31). */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => parseDateOnly(value) !== null, 'Must be a real calendar date');

export const createImportantDateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  type: importantDateTypeSchema.default('other'),
  notes: z.string().max(2000).nullable().optional(),
  personName: z.string().trim().min(1).max(120).nullable().optional(),
  date: dateOnlySchema,
  countFirstDay: z.boolean().default(false),
  repeat: importantDateRepeatSchema.default('yearly'),
  pinned: z.boolean().default(false),
  alertOffsetDays: z.number().int().min(0).max(365).nullable().optional(),
});

export const updateImportantDateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  type: importantDateTypeSchema.optional(),
  notes: z.string().max(2000).nullable().optional(),
  personName: z.string().trim().min(1).max(120).nullable().optional(),
  date: dateOnlySchema.optional(),
  countFirstDay: z.boolean().optional(),
  repeat: importantDateRepeatSchema.optional(),
  pinned: z.boolean().optional(),
  alertOffsetDays: z.number().int().min(0).max(365).nullable().optional(),
});

// --- Recipes Schemas ---
//
// Recipes are always shared between both members. Ingredients are stored on the recipe as one
// array rather than as rows of their own: a recipe is edited as a whole, and two people editing
// the same recipe at once is rare enough that last write wins on the array is acceptable.

export const recipeUnitSchema = z.enum(RECIPE_UNITS);

export const recipeIngredientSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1, 'Name is required').max(120),
  quantity: z.number().finite().positive().max(100000).nullable(),
  unit: recipeUnitSchema,
  staple: z.boolean(),
});

const recipeIngredientsSchema = z
  .array(recipeIngredientSchema)
  .max(100)
  .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length, 'Ingredient ids must be unique');

const servingsSchema = z.number().int().min(MIN_SERVINGS).max(MAX_SERVINGS);

export const createRecipeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  servings: servingsSchema.default(DEFAULT_SERVINGS),
  notes: z.string().max(5000).nullable().optional(),
  ingredients: recipeIngredientsSchema.default([]),
});

export const updateRecipeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  servings: servingsSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  ingredients: recipeIngredientsSchema.optional(),
});

// --- Meal Plans Schemas ---
//
// A plan is a pool of recipes for a period, shared between both members. The recipes are one array on
// the plan, for the same reasons as a recipe's ingredients: it is edited and read whole.

export const mealPlanRecipeSchema = z.object({
  recipeId: z.string().uuid(),
  servings: servingsSchema,
});

const mealPlanRecipesSchema = z
  .array(mealPlanRecipeSchema)
  .max(MAX_PLAN_RECIPES)
  .refine((rows) => new Set(rows.map((row) => row.recipeId)).size === rows.length, 'A recipe can be in a plan once');

const periodNotBackwards = (value: { startsOn?: string; endsOn?: string }) =>
  value.startsOn === undefined || value.endsOn === undefined || value.endsOn >= value.startsOn;

export const createMealPlanSchema = z
  .object({
    startsOn: dateOnlySchema,
    endsOn: dateOnlySchema,
    recipes: mealPlanRecipesSchema.default([]),
  })
  .refine(periodNotBackwards, { message: 'The plan cannot end before it starts', path: ['endsOn'] });

export const updateMealPlanSchema = z
  .object({
    startsOn: dateOnlySchema.optional(),
    endsOn: dateOnlySchema.optional(),
    recipes: mealPlanRecipesSchema.optional(),
  })
  .refine(periodNotBackwards, { message: 'The plan cannot end before it starts', path: ['endsOn'] });

// --- Google Calendar sync (REST, not the outbox) ---

export const externalVisibilitySchema = z.enum(EXTERNAL_VISIBILITIES);

export const updateExternalCalendarSchema = z
  .object({
    syncEnabled: z.boolean().optional(),
    visibility: externalVisibilitySchema.optional(),
  })
  .refine((v) => v.syncEnabled !== undefined || v.visibility !== undefined, 'Nothing to update');

export const updateExternalEventSchema = z
  .object({
    /** `null` clears the override. An override may only narrow the calendar's visibility. */
    visibilityOverride: z.enum(['busy_only', 'private']).nullable().optional(),
    /** Star the event so it is featured on the Today screen. */
    highlighted: z.boolean().optional(),
  })
  .refine((v) => v.visibilityOverride !== undefined || v.highlighted !== undefined, 'Nothing to update');

export const confirmExternalCalendarsSchema = z.object({
  calendars: z
    .array(
      z.object({
        id: z.string().uuid(),
        syncEnabled: z.boolean(),
        visibility: externalVisibilitySchema,
      }),
    )
    .max(200),
});

// --- Sync & Mutation Schemas ---

export const syncEntityNameSchema = z.enum([
  'events',
  'tasks',
  'lists',
  'list_items',
  'capture_items',
  'important_dates',
  'recipes',
  'meal_plans',
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
  highlighted: z.boolean().optional(),
});

const taskUpdatePayload = z.object({
  title: z.string().min(1).max(255).optional(),
  notes: z.string().max(2000).nullable().optional(),
  dueDate: isoDateTime.nullable().optional(),
  assigneeId: z.string().min(1).max(64).nullable().optional(),
  visibility: visibilitySchema.optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  completedAt: isoDateTime.nullable().optional(),
});

const listUpdatePayload = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(50).nullable().optional(),
  category: listCategorySchema.optional(),
  planId: z.string().uuid().nullable().optional(),
});

const listItemUpdatePayload = z.object({
  name: z.string().min(1).max(200).optional(),
  quantity: z.string().max(50).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  position: z.number().finite().nullable().optional(),
  contributions: z.array(groceryContributionSchema).max(50).nullable().optional(),
  editedByHand: z.boolean().optional(),
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
  important_dates: { INSERT: createImportantDateSchema, UPDATE: updateImportantDateSchema },
  recipes: { INSERT: createRecipeSchema, UPDATE: updateRecipeSchema },
  meal_plans: { INSERT: createMealPlanSchema, UPDATE: updateMealPlanSchema },
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
