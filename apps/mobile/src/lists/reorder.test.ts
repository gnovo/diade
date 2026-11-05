import { describe, it, expect } from 'vitest';
import { moveItem, POSITION_STEP, type Orderable } from './reorder';

const item = (id: string, position: number | null): Orderable => ({ id, position });
const ordered = (...positions: number[]) => positions.map((p, i) => item(String.fromCharCode(97 + i), p));

describe('moveItem', () => {
  it('does nothing for a move to the same place or out of range', () => {
    const items = ordered(1000, 2000, 3000);
    expect(moveItem(items, 1, 1)).toEqual([]);
    expect(moveItem(items, -1, 1)).toEqual([]);
    expect(moveItem(items, 0, 3)).toEqual([]);
    expect(moveItem([], 0, 0)).toEqual([]);
  });

  it('places the moved item halfway between its new neighbours, changing only that item', () => {
    const items = ordered(1000, 2000, 3000, 4000);
    expect(moveItem(items, 0, 2)).toEqual([{ id: 'a', position: 3500 }]); // b c [a] d
    expect(moveItem(items, 3, 1)).toEqual([{ id: 'd', position: 1500 }]); // a [d] b c
  });

  it('moving to the top or bottom steps past the first or last item', () => {
    const items = ordered(1000, 2000, 3000);
    expect(moveItem(items, 2, 0)).toEqual([{ id: 'c', position: 1000 - POSITION_STEP }]);
    expect(moveItem(items, 0, 2)).toEqual([{ id: 'a', position: 3000 + POSITION_STEP }]);
  });

  it('works with fractional neighbours from earlier moves', () => {
    const items = ordered(1000, 1500, 2000);
    expect(moveItem(items, 2, 1)).toEqual([{ id: 'c', position: 1250 }]); // a [c] b
  });

  it('numbers the whole list the first time, when some items have no position yet', () => {
    const items = [item('a', null), item('b', null), item('c', null)];
    expect(moveItem(items, 2, 0)).toEqual([
      { id: 'c', position: 1000 },
      { id: 'a', position: 2000 },
      { id: 'b', position: 3000 },
    ]);
  });

  it('returns only the items whose number changes when renumbering', () => {
    // Positioned items first, as the list is sorted; "c" has never been ordered.
    const items = [item('a', 1000), item('b', 2000), item('c', null)];
    expect(moveItem(items, 2, 1)).toEqual([
      { id: 'c', position: 2000 },
      { id: 'b', position: 3000 },
    ]); // a [c] b: "a" keeps 1000
  });

  it('renumbers when two neighbours are equal or too close for a midpoint', () => {
    const equal = [item('a', 1000), item('b', 1000), item('c', 2000)];
    // a [c] b renumbers to 1000, 2000, 3000: "a" and "c" already have theirs.
    expect(moveItem(equal, 2, 1)).toEqual([{ id: 'b', position: 3000 }]);
    const tight = [item('a', 1), item('b', 1 + 1e-9), item('c', 5)];
    expect(moveItem(tight, 2, 1)).toEqual([
      { id: 'a', position: 1000 },
      { id: 'c', position: 2000 },
      { id: 'b', position: 3000 },
    ]);
  });

  it('moves the only item nowhere, and numbers a lone unpositioned pair', () => {
    expect(moveItem([item('a', null)], 0, 0)).toEqual([]);
    expect(moveItem([item('a', null), item('b', null)], 0, 1)).toEqual([
      { id: 'b', position: 1000 },
      { id: 'a', position: 2000 },
    ]);
  });
});
