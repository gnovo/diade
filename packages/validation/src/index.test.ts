import { describe, it, expect } from 'vitest';
import {
  createSpaceSchema,
  createEventSchema,
  createTaskSchema,
  clientMutationSchema,
  syncPushSchema,
  parseSyncPayload,
  updateExternalCalendarSchema,
  updateExternalEventSchema,
  confirmExternalCalendarsSchema,
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
    expect(parseSyncPayload('lists', 'DELETE', { anything: 1 })).toEqual({ success: true, data: {} });
  });
});

describe('important dates', () => {
  it('applies defaults on insert: yearly, not pinned, type other', () => {
    const result = parseSyncPayload('important_dates', 'INSERT', { title: 'First date', date: '2020-08-18' });
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
    expect(parseSyncPayload('important_dates', 'INSERT', { title: 'x', date: '2026-02-31' }).success).toBe(false);
    expect(parseSyncPayload('important_dates', 'INSERT', { title: 'x', date: '18/08/2020' }).success).toBe(false);
    expect(parseSyncPayload('important_dates', 'UPDATE', { date: '2020-13-01' }).success).toBe(false);
  });

  it('rejects unknown types and repeat values', () => {
    expect(parseSyncPayload('important_dates', 'INSERT', { title: 'x', date: '2020-01-01', type: 'bday' }).success).toBe(false);
    expect(parseSyncPayload('important_dates', 'INSERT', { title: 'x', date: '2020-01-01', repeat: 'monthly' }).success).toBe(false);
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
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: 7 }).success).toBe(true);
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: null }).success).toBe(true);
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: -1 }).success).toBe(false);
    expect(parseSyncPayload('important_dates', 'UPDATE', { alertOffsetDays: 1.5 }).success).toBe(false);
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
    expect(updateExternalEventSchema.safeParse({ visibilityOverride: 'private' }).success).toBe(true);
    // "shared" is not an override: it would widen, so clearing (null) is the only way back.
    expect(updateExternalEventSchema.safeParse({ visibilityOverride: 'shared' }).success).toBe(false);
  });

  it('validates the picker payload', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(confirmExternalCalendarsSchema.safeParse({ calendars: [{ id, syncEnabled: true, visibility: 'shared' }] }).success).toBe(true);
    expect(confirmExternalCalendarsSchema.safeParse({ calendars: [{ id: 'nope', syncEnabled: true, visibility: 'shared' }] }).success).toBe(false);
  });

  it('accepts a list item position on insert and update, and rejects a non-number', () => {
    const listId = '5f9f1c9e-6f51-4a29-9d5c-0b6d7a1f2c3d';
    const insert = parseSyncPayload('list_items', 'INSERT', { listId, name: 'Milk', position: 1500.5 });
    expect(insert.success).toBe(true);
    expect(insert.success && (insert.data as { position?: number }).position).toBe(1500.5);

    const update = parseSyncPayload('list_items', 'UPDATE', { position: 2000 });
    expect(update.success).toBe(true);
    expect(update.success && (update.data as { position?: number }).position).toBe(2000);

    expect(parseSyncPayload('list_items', 'UPDATE', { position: null }).success).toBe(true);
    expect(parseSyncPayload('list_items', 'UPDATE', { position: 'first' }).success).toBe(false);
    expect(parseSyncPayload('list_items', 'UPDATE', { position: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});

describe('dates about other people', () => {
  it('accepts the new types and a person name', () => {
    const base = { title: "Marta's birthday", date: '1990-11-12' };
    for (const type of ['their_birthday', 'trip', 'other_anniversary']) {
      expect(parseSyncPayload('important_dates', 'INSERT', { ...base, type }).success).toBe(true);
    }
    const named = parseSyncPayload('important_dates', 'INSERT', { ...base, type: 'their_birthday', personName: ' Marta ' });
    expect(named.success && (named.data as { personName?: string }).personName).toBe('Marta');
  });

  it('allows clearing the name, and rejects an empty one', () => {
    expect(parseSyncPayload('important_dates', 'UPDATE', { personName: null }).success).toBe(true);
    expect(parseSyncPayload('important_dates', 'UPDATE', { personName: '   ' }).success).toBe(false);
  });
});

