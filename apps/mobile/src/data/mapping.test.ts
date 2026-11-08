import { describe, it, expect } from 'vitest';
import sqliteSource from '../storage/sqlite.ts?raw';
import type { ExternalCalendar, ExternalEvent, Task } from '@diade/domain';
import { toColumns, fromRow, toColumn, toKey } from './mapping';

describe('row mapping', () => {
  it('converts between camelCase keys and snake_case columns', () => {
    expect(toColumn('recurrenceRule')).toBe('recurrence_rule');
    expect(toKey('recurrence_rule')).toBe('recurrenceRule');
    expect(toKey('is_all_day')).toBe('isAllDay');
  });

  it('stores booleans as 0/1 and reads them back as booleans', () => {
    const { columns, values } = toColumns({ id: 'a', isChecked: true, isAllDay: false });
    expect(columns).toEqual(['id', 'is_checked', 'is_all_day']);
    expect(values).toEqual(['a', 1, 0]);

    expect(fromRow({ id: 'a', is_checked: 1, is_all_day: 0, due_date: null })).toEqual({
      id: 'a',
      isChecked: true,
      isAllDay: false,
      dueDate: null,
    });
  });

  it('stores ingredients as JSON text and reads them back as an array', () => {
    const ingredients = [{ id: 'i1', name: 'Salt', quantity: null, unit: 'unit', staple: true }];
    const { columns, values } = toColumns({ id: 'r', ingredients });
    expect(columns).toEqual(['id', 'ingredients']);
    expect(values).toEqual(['r', JSON.stringify(ingredients)]);
    expect(fromRow({ id: 'r', ingredients: JSON.stringify(ingredients) })).toEqual({ id: 'r', ingredients });
  });

  it('reads an unreadable ingredients column as an empty array rather than throwing', () => {
    expect(fromRow({ id: 'r', ingredients: 'not json' })).toEqual({ id: 'r', ingredients: [] });
  });

  it('skips undefined values so partial updates do not overwrite columns', () => {
    const { columns } = toColumns({ title: 'New', notes: undefined });
    expect(columns).toEqual(['title']);
  });
});

describe('important date rows', () => {
  it('stores the pin and first-day flags as 0/1 and restores them as booleans', () => {
    const { columns, values } = toColumns({ id: 'a', countFirstDay: true, pinned: false, alertOffsetDays: 7 });
    expect(columns).toEqual(['id', 'count_first_day', 'pinned', 'alert_offset_days']);
    expect(values).toEqual(['a', 1, 0, 7]);

    expect(fromRow({ id: 'a', count_first_day: 0, pinned: 1, alert_offset_days: null, date: '2020-08-18' })).toEqual({
      id: 'a',
      countFirstDay: false,
      pinned: true,
      alertOffsetDays: null,
      date: '2020-08-18',
    });
  });
});

describe('Google Calendar rows', () => {
  // Every field the server sends must have a local column, or pulling would fail on the device.
  const columnsOf = (table: string): Set<string> => {
    const body = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n    \\);`).exec(sqliteSource)?.[1] ?? '';
    return new Set(
      body
        .split('\n')
        .map((line) => line.trim().split(/\s+/)[0]!)
        .filter((name) => /^[a-z_]+$/.test(name) && name !== 'primary'),
    );
  };

  const event: ExternalEvent = {
    id: 'e', calendarId: 'c', userId: 'u', googleEventId: 'g', icalUid: null, title: null, description: null,
    location: null, startAt: null, endAt: null, startDate: null, endDate: null, isAllDay: false,
    status: 'confirmed', transparency: 'opaque', myResponse: null, googleVisibility: null,
    visibilityOverride: null, htmlLink: null, isRecurringInstance: false, highlighted: false, effectiveVisibility: 'shared',
    redacted: false, createdAt: 'x', updatedAt: 'x', deletedAt: null,
  };
  const calendar: ExternalCalendar = {
    id: 'c', userId: 'u', name: null, color: null, timeZone: null, accessRole: null, syncEnabled: true,
    visibility: 'shared', lastSyncedAt: null, lastError: null, createdAt: 'x', updatedAt: 'x', deletedAt: null,
  };
  const task: Task = {
    id: 't', spaceId: 's', creatorId: 'u', assigneeId: null, title: 'x', notes: null, dueDate: null,
    status: 'todo', priority: 'normal', visibility: 'shared', completedAt: null, createdAt: 'x',
    updatedAt: 'x', deletedAt: null,
  };

  it.each([
    ['local_external_events', event],
    ['local_external_calendars', calendar],
    ['local_tasks', task],
  ])('%s has a column for every field the server sends', (table, record) => {
    const known = columnsOf(table);
    expect(known.size).toBeGreaterThan(5);
    const { columns } = toColumns(record as unknown as Record<string, unknown>);
    expect(columns.filter((c) => !known.has(c))).toEqual([]);
  });

  it('stores booleans as 0/1 and reads them back', () => {
    const { columns, values } = toColumns({ redacted: true, syncEnabled: false, isRecurringInstance: true });
    expect(Object.fromEntries(columns.map((c, i) => [c, values[i]]))).toEqual({
      redacted: 1,
      sync_enabled: 0,
      is_recurring_instance: 1,
    });
    expect(fromRow({ redacted: 1, sync_enabled: 0 })).toEqual({ redacted: true, syncEnabled: false });
  });
});
