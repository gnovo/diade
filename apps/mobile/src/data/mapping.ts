/**
 * Maps between domain objects (camelCase, JS booleans) and SQLite rows (snake_case, 0/1).
 * Local table columns are exactly the snake_case form of the server columns, so a
 * server record can be stored without per-entity mapping code.
 */

const BOOLEAN_KEYS = new Set(['isAllDay', 'isChecked', 'countFirstDay', 'pinned']);

export type Row = Record<string, unknown>;

export const toColumn = (key: string): string => key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
export const toKey = (column: string): string =>
  column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Converts a domain object into SQLite-bindable column/value pairs. */
export function toColumns(record: Row): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    columns.push(toColumn(key));
    values.push(BOOLEAN_KEYS.has(key) ? (value ? 1 : 0) : value);
  }
  return { columns, values };
}

/** Converts a SQLite row back into a domain object. */
export function fromRow(row: Row): Row {
  const result: Row = {};
  for (const [column, value] of Object.entries(row)) {
    const key = toKey(column);
    result[key] = BOOLEAN_KEYS.has(key) ? value === 1 : value;
  }
  return result;
}
