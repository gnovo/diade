import { describe, it, expect } from 'vitest';
import {
  createSpaceSchema,
  createEventSchema,
  createTaskSchema,
  clientMutationSchema,
  syncPushSchema,
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
});
