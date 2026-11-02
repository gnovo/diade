import { describe, it, expect } from 'vitest';
import { parseLocalDateTime, toDateInputValue, toTimeInputValue } from './datetime';

describe('parseLocalDateTime', () => {
  it('combines a date and time into a local Date', () => {
    const d = parseLocalDateTime('2026-11-14', '19:30');
    expect(d).not.toBeNull();
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(10);
    expect(d?.getDate()).toBe(14);
    expect(d?.getHours()).toBe(19);
    expect(d?.getMinutes()).toBe(30);
  });

  it('rejects malformed input and rolled-over dates', () => {
    expect(parseLocalDateTime('14/11/2026', '19:30')).toBeNull();
    expect(parseLocalDateTime('2026-11-14', '7pm')).toBeNull();
    expect(parseLocalDateTime('2026-02-31', '10:00')).toBeNull();
  });

  it('round-trips with the input formatters', () => {
    const d = parseLocalDateTime('2026-03-05', '08:05');
    expect(d && toDateInputValue(d)).toBe('2026-03-05');
    expect(d && toTimeInputValue(d)).toBe('08:05');
  });
});
