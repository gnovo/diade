import { describe, it, expect } from 'vitest';
import { layoutBlocks, minutesIntoDay, weekDays, MIN_BLOCK_MINUTES } from './timeGrid';
import { dayKey } from './monthGrid';

const b = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });
const byId = (blocks: ReturnType<typeof layoutBlocks>) => Object.fromEntries(blocks.map((p) => [p.id, p]));

describe('layoutBlocks', () => {
  it('gives a lone event the full width', () => {
    expect(layoutBlocks([b('a', 540, 600)])).toEqual([{ id: 'a', startMin: 540, endMin: 600, column: 0, columns: 1 }]);
  });

  it('keeps back-to-back events in one column', () => {
    const p = byId(layoutBlocks([b('a', 540, 600), b('b', 600, 660)]));
    expect([p.a!.column, p.a!.columns, p.b!.column, p.b!.columns]).toEqual([0, 1, 0, 1]);
  });

  it('puts two overlapping events side by side', () => {
    const p = byId(layoutBlocks([b('a', 540, 660), b('b', 600, 720)]));
    expect([p.a!.column, p.b!.column]).toEqual([0, 1]);
    expect([p.a!.columns, p.b!.columns]).toEqual([2, 2]);
  });

  it('reuses a free column and shares one column count across a chain', () => {
    // a 9-11, b 9:30-10, c 10-12. b and c do not overlap, so c reuses b's column.
    const p = byId(layoutBlocks([b('a', 540, 660), b('b', 570, 600), b('c', 600, 720)]));
    expect(p.a!.column).toBe(0);
    expect(p.b!.column).toBe(1);
    expect(p.c!.column).toBe(1);
    expect([p.a!.columns, p.b!.columns, p.c!.columns]).toEqual([2, 2, 2]);
  });

  it('starts a new group, with its own width, after the previous one ends', () => {
    const p = byId(layoutBlocks([b('a', 540, 600), b('b', 570, 630), b('c', 700, 760)]));
    expect(p.a!.columns).toBe(2);
    expect(p.c).toMatchObject({ column: 0, columns: 1 });
  });

  it('treats a very short event as at least the minimum height when finding overlaps', () => {
    const p = byId(layoutBlocks([b('call', 540, 545), b('next', 550, 600)]));
    expect(MIN_BLOCK_MINUTES).toBeGreaterThan(10);
    expect([p.call!.column, p.next!.column]).toEqual([0, 1]);
  });

  it('is stable for unordered input', () => {
    const p = byId(layoutBlocks([b('b', 600, 720), b('a', 540, 660)]));
    expect([p.a!.column, p.b!.column]).toEqual([0, 1]);
  });
});

describe('minutesIntoDay', () => {
  const day = new Date(2026, 10, 5);
  it('counts minutes after local midnight', () => {
    expect(minutesIntoDay(new Date(2026, 10, 5, 9, 30), day)).toBe(570);
  });
  it('clamps events that start before or end after the day', () => {
    expect(minutesIntoDay(new Date(2026, 10, 4, 22, 0), day)).toBe(0);
    expect(minutesIntoDay(new Date(2026, 10, 6, 2, 0), day)).toBe(1440);
  });
});

describe('weekDays', () => {
  it('returns Monday to Sunday around the day', () => {
    const keys = weekDays(new Date(2026, 10, 5)).map(dayKey); // Thursday
    expect(keys[0]).toBe('2026-11-02');
    expect(keys[6]).toBe('2026-11-08');
  });
  it('keeps a Sunday in the week that ends on it', () => {
    expect(dayKey(weekDays(new Date(2026, 10, 8))[0]!)).toBe('2026-11-02');
  });
  it('can start the week on Sunday', () => {
    expect(dayKey(weekDays(new Date(2026, 10, 5), 0)[0]!)).toBe('2026-11-01');
  });
});
