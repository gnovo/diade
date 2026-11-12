/**
 * Maps between domain objects (camelCase, JS booleans) and SQLite rows (snake_case, 0/1).
 * Local table columns are exactly the snake_case form of the server columns, so a
 * server record can be stored without per-entity mapping code.
 */

const BOOLEAN_KEYS = new Set([
  'isAllDay',
  'isChecked',
  'countFirstDay',
  'pinned',
  'syncEnabled',
  'redacted',
  'isRecurringInstance',
  'highlighted',
  'editedByHand',
]);

/** Booleans that may also be unset: stored as 1, 0 or NULL, and read back as true, false or null. */
const NULLABLE_BOOLEAN_KEYS = new Set(['staple']);

/** Stored as JSON text locally; arrays and objects in the domain. */
const JSON_KEYS = new Set([
  'ingredients',
  'recipes',
  'contributions',
  'aliases',
  'nutrition',
  'workout',
]);

export type Row = Record<string, unknown>;

export const toColumn = (key: string): string =>
  key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
export const toKey = (column: string): string =>
  column.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Converts a domain object into SQLite-bindable column/value pairs. */
export function toColumns(record: Row): { columns: string[]; values: unknown[] } {
  const columns: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue;
    columns.push(toColumn(key));
    // A null JSON column stays SQL NULL ("not from a plan") rather than the text 'null'.
    values.push(
      NULLABLE_BOOLEAN_KEYS.has(key) && (value === null || typeof value === 'boolean')
        ? value === null
          ? null
          : value
            ? 1
            : 0
        : BOOLEAN_KEYS.has(key)
          ? value
            ? 1
            : 0
          : JSON_KEYS.has(key) && value !== null
            ? JSON.stringify(value)
            : value,
    );
  }
  return { columns, values };
}

function parseJson(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/** Converts a SQLite row back into a domain object. */
export function fromRow(row: Row): Row {
  const result: Row = {};
  for (const [column, value] of Object.entries(row)) {
    const key = toKey(column);
    result[key] = NULLABLE_BOOLEAN_KEYS.has(key)
      ? value === null || value === undefined
        ? null
        : value === 1
      : BOOLEAN_KEYS.has(key)
        ? value === 1
        : JSON_KEYS.has(key)
          ? parseJson(value)
          : value;
  }
  return result;
}
