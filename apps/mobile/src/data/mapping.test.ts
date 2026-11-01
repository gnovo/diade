import { describe, it, expect } from 'vitest';
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

  it('skips undefined values so partial updates do not overwrite columns', () => {
    const { columns } = toColumns({ title: 'New', notes: undefined });
    expect(columns).toEqual(['title']);
  });
});
