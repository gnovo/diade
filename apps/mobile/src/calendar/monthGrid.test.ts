import { describe, it, expect } from 'vitest';
import { dayKey, dayMarkers, firstOfMonth, isSameMonth, monthGridDays, monthGridStart, shiftMonth } from './monthGrid';
import type { AgendaEntry } from '../data/unifiedAgenda';

const palette = { event: '#event', task: '#task', date: '#date', neutral: '#neutral' };
const ext = (color: string | null): AgendaEntry =>
  ({ kind: 'external', calendar: color === null ? null : { color } }) as unknown as AgendaEntry;
const task = (status: string): AgendaEntry => ({ kind: 'task', task: { status } }) as unknown as AgendaEntry;

describe('monthGridStart', () => {
  // 1 Nov 2026 is a Sunday.
  it('starts the grid on the Monday on or before the 1st', () => {
    expect(dayKey(monthGridStart(new Date(2026, 10, 14)))).toBe('2026-10-26');
  });
  it('starts on the 1st when it already is the first weekday', () => {
    expect(dayKey(monthGridStart(new Date(2026, 10, 14), 0))).toBe('2026-11-01');
    expect(dayKey(monthGridStart(new Date(2026, 5, 3)))).toBe('2026-06-01'); // 1 Jun 2026 is a Monday
  });
});

describe('monthGridDays', () => {
  it('always shows six whole weeks', () => {
    for (const month of [new Date(2026, 1, 1), new Date(2026, 10, 1), new Date(2027, 0, 1)]) {
      const days = monthGridDays(month);
      expect(days).toHaveLength(42);
      expect(days[0]!.getDay()).toBe(1);
    }
  });
  it('contains every day of the month and runs consecutively across a DST change', () => {
    const days = monthGridDays(new Date(2026, 9, 1)); // October: Lisbon clocks go back on the 25th
    const keys = days.map(dayKey);
    expect(new Set(keys).size).toBe(42);
    for (let d = 1; d <= 31; d += 1) expect(keys).toContain(dayKey(new Date(2026, 9, d)));
    for (let i = 1; i < days.length; i += 1) {
      const gap = Math.round((days[i]!.getTime() - days[i - 1]!.getTime()) / 3_600_000);
      expect([23, 24, 25]).toContain(gap);
    }
  });
});

describe('month helpers', () => {
  it('shifts across year boundaries', () => {
    expect(dayKey(shiftMonth(new Date(2026, 11, 20), 1))).toBe('2027-01-01');
    expect(dayKey(shiftMonth(new Date(2026, 0, 31), -1))).toBe('2025-12-01');
  });
  it('compares months', () => {
    expect(isSameMonth(new Date(2026, 10, 1), new Date(2026, 10, 30))).toBe(true);
    expect(isSameMonth(new Date(2026, 10, 1), new Date(2027, 10, 1))).toBe(false);
    expect(dayKey(firstOfMonth(new Date(2026, 10, 17)))).toBe('2026-11-01');
  });
});

describe('dayMarkers', () => {
  it('uses one dot per colour, in order of appearance', () => {
    const m = dayMarkers([ext('#a'), ext('#a'), ext('#b')], palette);
    expect(m).toEqual({ colors: ['#a', '#b'], extra: 0 });
  });
  it('caps the dots and counts the rest', () => {
    const m = dayMarkers([ext('#a'), ext('#b'), ext('#c'), ext('#d'), ext('#e')], palette, 3);
    expect(m).toEqual({ colors: ['#a', '#b', '#c'], extra: 2 });
  });
  it('falls back to the neutral colour for an uncoloured or hidden calendar', () => {
    expect(dayMarkers([ext(null)], palette).colors).toEqual(['#neutral']);
  });
  it('ignores completed tasks but marks open ones', () => {
    expect(dayMarkers([task('completed')], palette).colors).toEqual([]);
    expect(dayMarkers([task('todo')], palette).colors).toEqual(['#task']);
  });
});
