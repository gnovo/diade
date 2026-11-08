import { describe, expect, it } from 'vitest';
import {
  clientMutationSchema,
  confirmExternalCalendarsSchema,
  createEventSchema,
  createSpaceSchema,
  createTaskSchema,
  parseSyncPayload,
  syncPushSchema,
  updateExternalCalendarSchema,
  updateExternalEventSchema,
} from './index';

describe('Validation Schemas', () => {
  it('validates space creation input', () => {
    expect(() => createSpaceSchema.parse({ name: 'Our Space' })).not.toThrow();
    expect(() => createSpaceSchema.parse({ name: '' })).toThrow();
  });

  it('validates event input with ISO datetime strings', () => {
    const validEvent = {
      title: 'Anniversary Dinner',
      startAt: '2026-11-01T19:00:00.000Z',
      endAt: '2026-11-01T21:00:00.000Z',
      isAllDay: false,
      visibility: 'shared',
      category: 'important_date',
    };
    expect(() => createEventSchema.parse(validEvent)).not.toThrow();

    const invalidDateEvent = {
      ...validEvent,
      startAt: 'not-a-date',
    };
    expect(() => createEventSchema.parse(invalidDateEvent)).toThrow();
  });

  it('validates task input and handles nullable assigneeId', () => {
    const taskForBoth = {
      title: 'Buy Groceries',
      assigneeId: null,
      visibility: 'shared',
    };
    expect(() => createTaskSchema.parse(taskForBoth)).not.toThrow();

    const taskWithUser = {
      title: 'Pick up dry cleaning',
      assigneeId: '123e4567-e89b-12d3-a456-426614174000',
      visibility: 'personal',
    };
    expect(() => createTaskSchema.parse(taskWithUser)).not.toThrow();
  });

  it('validates client sync mutation payloads', () => {
    const mutation = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      entity: 'tasks',
      operation: 'INSERT',
      recordId: '123e4567-e89b-12d3-a456-426614174002',
      payload: { title: 'Do laundry' },
      clientTimestamp: Date.now(),
    };
    expect(() => clientMutationSchema.parse(mutation)).not.toThrow();

    const batch = {
      mutations: [mutation],
    };
    expect(() => syncPushSchema.parse(batch)).not.toThrow();
  });

  it('accepts non-UUID Better Auth user ids as task assignees', () => {
    const result = parseSyncPayload('tasks', 'INSERT', {
      title: 'Water plants',
      assigneeId: 'k3Jd9sLq2aXb7mNpQr8tVw1yZc4eHu0f',
    });
    expect(result.success).toBe(true);
  });

  it('does not inject schema defaults into UPDATE payloads', () => {
    const result = parseSyncPayload('events', 'UPDATE', { title: 'Renamed' });
    expect(result).toEqual({ success: true, data: { title: 'Renamed' } });
  });

  it('rejects malformed payloads with a readable message', () => {
    const result = parseSyncPayload('events', 'INSERT', { title: '', startAt: 'soon' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain('title');
  });

  it('ignores payloads for DELETE mutations', () => {
    expect(parseSyncPayload('lists', 'DELETE', { anything: 1 })).toEqual({
      success: true,
      data: {},
    });
  });
});

describe('important dates', () => {
  it('applies defaults on insert: yearly, not pinned, type other', () => {
    const result = parseSyncPayload('important_dates', 'INSERT', {
      title: 'First date',
      date: '2020-08-18',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        title: 'First date',
        type: 'other',
        repeat: 'yearly',
        pinned: false,
        countFirstDay: false,
      });
    }
  });

  it('does not apply defaults on update, so absent fields stay unchanged', () => {
    const result = parseSyncPayload('important_dates', 'UPDATE', { title: 'Renamed' });
    expect(result).toEqual({ success: true, data: { title: 'Renamed' } });
  });

  it('rejects impossible or malformed dates', () => {
    expect(
      parseSyncPayload('important_dates', 'INSERT', { title: 'x', date: '2026-02-31' }).success,
    ).toBe(false);
    expect(
      parseSyncPayload('important_dates', 'INSERT', { title: 'x', date: '18/08/2020' }).success,
    ).toBe(false);
    expect(parseSyncPayload('important_dates', 'UPDATE', { date: '2020-13-01' }).success).toBe(
      false,
    );
  });

  it('rejects unknown types and repeat values', () => {
    expect(
      parseSyncPayload('important_dates', 'INSERT', {
        title: 'x',
        date: '2020-01-01',
        type: 'bday',
      }).success,
    ).toBe(false);
    expect(
      parseSyncPayload('important_dates', 'INSERT', {
        title: 'x',
        date: '2020-01-01',
        repeat: 'monthly',
      }).success,
    ).toBe(false);
  });

  it('strips a client-supplied visibility: these dates are always shared', () => {
    const result = parseSyncPayload('important_dates', 'INSERT', {
      title: 'x',
      date: '2020-01-01',
      visibility: 'personal',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('visibility');
  });

  it('bounds the alert offset', () => {
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: 7 }).success).toBe(
      true,
    );
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: null }).success).toBe(
      true,
    );
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: -1 }).success).toBe(
      false,
    );
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: 1.5 }).success).toBe(
      false,
    );
  });
});

describe('task priority', () => {
  it('defaults to normal on insert and leaves it unchanged on update', () => {
    const insert = parseSyncPayload('tasks', 'INSERT', { title: 'Pay rent' });
    expect(insert.success && insert.data.priority).toBe('normal');
    const update = parseSyncPayload('tasks', 'UPDATE', { title: 'Pay rent' });
    expect(update.success && 'priority' in update.data).toBe(false);
  });

  it('accepts important and rejects anything else', () => {
    expect(parseSyncPayload('tasks', 'UPDATE', { priority: 'important' }).success).toBe(true);
    expect(parseSyncPayload('tasks', 'UPDATE', { priority: 'urgent' }).success).toBe(false);
  });
});

describe('calendar settings schemas', () => {
  it('requires a change when updating a calendar', () => {
    expect(updateExternalCalendarSchema.safeParse({}).success).toBe(false);
    expect(updateExternalCalendarSchema.safeParse({ visibility: 'busy_only' }).success).toBe(true);
    expect(updateExternalCalendarSchema.safeParse({ syncEnabled: false }).success).toBe(true);
    expect(updateExternalCalendarSchema.safeParse({ visibility: 'everyone' }).success).toBe(false);
  });

  it('only allows an event override that narrows, or clears it', () => {
    expect(updateExternalEventSchema.safeParse({ visibilityOverride: null }).success).toBe(true);
    expect(updateExternalEventSchema.safeParse({ visibilityOverride: 'private' }).success).toBe(
      true,
    );
    // "shared" is not an override: it would widen, so clearing (null) is the only way back.
    expect(updateExternalEventSchema.safeParse({ visibilityOverride: 'shared' }).success).toBe(
      false,
    );
  });

  it('validates the picker payload', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      confirmExternalCalendarsSchema.safeParse({
        calendars: [{ id, syncEnabled: true, visibility: 'shared' }],
      }).success,
    ).toBe(true);
    expect(
      confirmExternalCalendarsSchema.safeParse({
        calendars: [{ id: 'nope', syncEnabled: true, visibility: 'shared' }],
      }).success,
    ).toBe(false);
  });

  it('accepts a list item position on insert and update, and rejects a non-number', () => {
    const listId = '5f9f1c9e-6f51-4a29-9d5c-0b6d7a1f2c3d';
    const insert = parseSyncPayload('list_items', 'INSERT', {
      listId,
      name: 'Milk',
      position: 1500.5,
    });
    expect(insert.success).toBe(true);
    expect(insert.success && (insert.data as { position?: number }).position).toBe(1500.5);

    const update = parseSyncPayload('list_items', 'UPDATE', { position: 2000 });
    expect(update.success).toBe(true);
    expect(update.success && (update.data as { position?: number }).position).toBe(2000);

    expect(parseSyncPayload('list_items', 'UPDATE', { position: null }).success).toBe(true);
    expect(parseSyncPayload('list_items', 'UPDATE', { position: 'first' }).success).toBe(false);
    expect(
      parseSyncPayload('list_items', 'UPDATE', { position: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
  });
});

describe('dates about other people', () => {
  it('accepts the new types and a person name', () => {
    const base = { title: "Marta's birthday", date: '1990-11-12' };
    for (const type of ['their_birthday', 'trip', 'other_anniversary']) {
      expect(parseSyncPayload('important_dates', 'INSERT', { ...base, type }).success).toBe(true);
    }
    const named = parseSyncPayload('important_dates', 'INSERT', {
      ...base,
      type: 'their_birthday',
      personName: ' Marta ',
    });
    expect(named.success && (named.data as { personName?: string }).personName).toBe('Marta');
  });

  it('allows clearing the name, and rejects an empty one', () => {
    expect(parseSyncPayload('important_dates', 'UPDATE', { personName: null }).success).toBe(true);
    expect(parseSyncPayload('important_dates', 'UPDATE', { personName: '   ' }).success).toBe(
      false,
    );
  });
});

describe('recipes sync payloads', () => {
  const salt = { id: 'i1', name: 'Salt', quantity: 1, unit: 'tsp', staple: true };

  it('defaults servings and ingredients on INSERT', () => {
    const result = parseSyncPayload('recipes', 'INSERT', { name: 'Carbonara' });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data).toMatchObject({ name: 'Carbonara', servings: 4, ingredients: [] });
  });

  it('leaves absent fields out of an UPDATE, so they mean "unchanged"', () => {
    const result = parseSyncPayload('recipes', 'UPDATE', { name: 'Renamed' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ name: 'Renamed' });
  });

  it('accepts ingredients with a null quantity (to taste)', () => {
    expect(
      parseSyncPayload('recipes', 'INSERT', {
        name: 'x',
        ingredients: [{ ...salt, quantity: null, unit: 'unit' }],
      }).success,
    ).toBe(true);
  });

  it('rejects an empty name, bad servings, bad units and bad quantities', () => {
    expect(parseSyncPayload('recipes', 'INSERT', { name: '  ' }).success).toBe(false);
    expect(parseSyncPayload('recipes', 'INSERT', { name: 'x', servings: 0 }).success).toBe(false);
    expect(parseSyncPayload('recipes', 'INSERT', { name: 'x', servings: 2.5 }).success).toBe(false);
    expect(
      parseSyncPayload('recipes', 'INSERT', { name: 'x', ingredients: [{ ...salt, unit: 'oz' }] })
        .success,
    ).toBe(false);
    expect(
      parseSyncPayload('recipes', 'INSERT', { name: 'x', ingredients: [{ ...salt, quantity: -1 }] })
        .success,
    ).toBe(false);
    expect(
      parseSyncPayload('recipes', 'INSERT', { name: 'x', ingredients: [{ ...salt, name: '' }] })
        .success,
    ).toBe(false);
  });

  it('rejects duplicate ingredient ids and more than 100 ingredients', () => {
    expect(parseSyncPayload('recipes', 'UPDATE', { ingredients: [salt, salt] }).success).toBe(
      false,
    );
    const many = Array.from({ length: 101 }, (_, n) => ({ ...salt, id: `i${n}` }));
    expect(parseSyncPayload('recipes', 'UPDATE', { ingredients: many }).success).toBe(false);
  });

  it('strips fields it does not know, such as visibility', () => {
    const result = parseSyncPayload('recipes', 'INSERT', { name: 'x', visibility: 'personal' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('visibility');
  });
});

describe('meal plans sync payloads', () => {
  const recipeId = '66666666-6666-4666-8666-666666666666';
  const plan = {
    startsOn: '2026-11-09',
    endsOn: '2026-11-15',
    recipes: [{ recipeId, servings: 4 }],
  };

  it('accepts a plan with a period and recipes, and defaults the recipes to none', () => {
    expect(parseSyncPayload('meal_plans', 'INSERT', plan).success).toBe(true);
    const bare = parseSyncPayload('meal_plans', 'INSERT', {
      startsOn: '2026-11-09',
      endsOn: '2026-11-09',
    });
    expect(bare).toMatchObject({ success: true, data: { recipes: [] } });
  });

  it('accepts partial updates', () => {
    expect(parseSyncPayload('meal_plans', 'UPDATE', { recipes: plan.recipes }).success).toBe(true);
    expect(parseSyncPayload('meal_plans', 'UPDATE', { startsOn: '2026-11-02' }).success).toBe(true);
  });

  it('rejects a backwards period, a bad date and a bad servings count', () => {
    expect(
      parseSyncPayload('meal_plans', 'INSERT', { ...plan, endsOn: '2026-11-01' }).success,
    ).toBe(false);
    expect(
      parseSyncPayload('meal_plans', 'UPDATE', { startsOn: '2026-11-10', endsOn: '2026-11-09' })
        .success,
    ).toBe(false);
    expect(
      parseSyncPayload('meal_plans', 'INSERT', { ...plan, startsOn: '2026-02-31' }).success,
    ).toBe(false);
    expect(
      parseSyncPayload('meal_plans', 'INSERT', { ...plan, recipes: [{ recipeId, servings: 0 }] })
        .success,
    ).toBe(false);
  });

  it('rejects the same recipe twice and a recipe id that is not a UUID', () => {
    const twice = { ...plan, recipes: [plan.recipes[0], plan.recipes[0]] };
    expect(parseSyncPayload('meal_plans', 'INSERT', twice).success).toBe(false);
    expect(
      parseSyncPayload('meal_plans', 'INSERT', {
        ...plan,
        recipes: [{ recipeId: 'x', servings: 2 }],
      }).success,
    ).toBe(false);
  });
});

describe('plan provenance on lists and items', () => {
  const recipeId = '66666666-6666-4666-8666-666666666666';
  const contribution = {
    recipeId,
    recipeName: 'Carbonara',
    key: 'egg|count',
    quantity: 3,
    unit: 'unit',
  };

  it('lets a list point at a plan, or at none', () => {
    expect(
      parseSyncPayload('lists', 'INSERT', { name: 'Groceries', planId: recipeId }).success,
    ).toBe(true);
    expect(parseSyncPayload('lists', 'INSERT', { name: 'Groceries', planId: null }).success).toBe(
      true,
    );
    expect(parseSyncPayload('lists', 'INSERT', { name: 'Groceries', planId: 'nope' }).success).toBe(
      false,
    );
  });

  it('carries contributions and the hand-edited flag on items', () => {
    const base = { listId: recipeId, name: 'Eggs' };
    expect(
      parseSyncPayload('list_items', 'INSERT', {
        ...base,
        contributions: [contribution],
        editedByHand: false,
      }).success,
    ).toBe(true);
    expect(parseSyncPayload('list_items', 'INSERT', { ...base, contributions: null }).success).toBe(
      true,
    );
    expect(parseSyncPayload('list_items', 'UPDATE', { editedByHand: true }).success).toBe(true);
    expect(
      parseSyncPayload('list_items', 'UPDATE', { contributions: [{ ...contribution, unit: 'oz' }] })
        .success,
    ).toBe(false);
    expect(
      parseSyncPayload('list_items', 'UPDATE', {
        contributions: [{ ...contribution, quantity: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe('ingredient catalog sync payloads', () => {
  const mergedInto = '77777777-7777-4777-8777-777777777777';

  it('accepts an ingredient with a name and a match key, and defaults the aliases to none', () => {
    const result = parseSyncPayload('ingredients', 'INSERT', { name: 'Meat', matchKey: 'meat' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.aliases).toEqual([]);
  });

  it('accepts aliases and a merge target, and rejects a name or key that is empty', () => {
    expect(
      parseSyncPayload('ingredients', 'INSERT', {
        name: 'Meet',
        matchKey: 'meet',
        aliases: ['Mince'],
        mergedIntoId: mergedInto,
      }).success,
    ).toBe(true);
    expect(parseSyncPayload('ingredients', 'INSERT', { name: ' ', matchKey: 'meat' }).success).toBe(
      false,
    );
    expect(parseSyncPayload('ingredients', 'INSERT', { name: 'Meat', matchKey: '' }).success).toBe(
      false,
    );
    expect(
      parseSyncPayload('ingredients', 'INSERT', {
        name: 'Meat',
        matchKey: 'meat',
        mergedIntoId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('lets an update change the name, aliases or merge, but not the match key', () => {
    expect(parseSyncPayload('ingredients', 'UPDATE', { name: 'Beef' }).success).toBe(true);
    expect(
      parseSyncPayload('ingredients', 'UPDATE', { aliases: ['Mince', 'Ground beef'] }).success,
    ).toBe(true);
    expect(parseSyncPayload('ingredients', 'UPDATE', { mergedIntoId: null }).success).toBe(true);
    const withKey = parseSyncPayload('ingredients', 'UPDATE', { name: 'Beef', matchKey: 'other' });
    expect(withKey.success).toBe(true);
    if (withKey.success) expect(withKey.data).not.toHaveProperty('matchKey');
  });

  it('accepts an optional ingredientId on a recipe line', () => {
    const line = { id: 'a', name: 'Meat', quantity: 500, unit: 'g', staple: false };
    expect(
      parseSyncPayload('recipes', 'INSERT', { name: 'Stew', ingredients: [line] }).success,
    ).toBe(true);
    expect(
      parseSyncPayload('recipes', 'INSERT', {
        name: 'Stew',
        ingredients: [{ ...line, ingredientId: mergedInto }],
      }).success,
    ).toBe(true);
    expect(
      parseSyncPayload('recipes', 'INSERT', {
        name: 'Stew',
        ingredients: [{ ...line, ingredientId: 'x' }],
      }).success,
    ).toBe(false);
  });
});
