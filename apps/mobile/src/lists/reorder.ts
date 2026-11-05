export interface Orderable {
  id: string;
  position: number | null;
}

export interface PositionUpdate {
  id: string;
  position: number;
}

/** Spacing used when a whole list is (re)numbered, so later moves have room between neighbours. */
export const POSITION_STEP = 1000;
/** Below this gap between two neighbours a midpoint is no longer reliable, so the list is renumbered. */
const MIN_GAP = 1e-6;

/**
 * Works out which items need a new `position` so that moving `items[from]` to index `to` sticks.
 * `items` is the order currently on screen.
 *
 * Normally that is just the moved item, placed halfway between its new neighbours, so other
 * devices only receive one change. When the list has never been ordered (some items have no
 * position), or two neighbours are too close or equal, the whole list is renumbered instead and
 * only the items whose number actually changes are returned.
 */
export function moveItem(items: readonly Orderable[], from: number, to: number): PositionUpdate[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [];

  const moved = items[from]!;
  const target = items.filter((_, index) => index !== from);
  target.splice(to, 0, moved);

  if (items.every((item) => item.position !== null)) {
    const before = target[to - 1]?.position ?? null;
    const after = target[to + 1]?.position ?? null;
    let position: number | null = null;
    if (before !== null && after !== null) {
      position = after - before >= MIN_GAP * 2 ? (before + after) / 2 : null;
    } else if (after !== null) {
      position = after - POSITION_STEP;
    } else if (before !== null) {
      position = before + POSITION_STEP;
    } else {
      position = POSITION_STEP;
    }
    if (position !== null) return [{ id: moved.id, position }];
  }

  return target.flatMap((item, index) => {
    const position = (index + 1) * POSITION_STEP;
    return item.position === position ? [] : [{ id: item.id, position }];
  });
}
