/**
 * Day and week view maths: where a timed event sits in its day, and how events that overlap
 * share the width. Pure, so the layout rules are unit tested rather than read off a screen.
 */
import { addLocalDays } from '@diade/domain';

const MINUTES_PER_DAY = 1440;
/** Events shorter than this are drawn this tall, so a 10 minute call is still tappable. */
export const MIN_BLOCK_MINUTES = 30;

export interface TimedBlock {
  id: string;
  startMin: number;
  endMin: number;
}

export interface PlacedBlock extends TimedBlock {
  /** Zero-based column inside the group of events that overlap. */
  column: number;
  /** How many columns that group needs. The block takes 1/columns of the width. */
  columns: number;
}

/** Minutes after local midnight of `day`, clamped to that day (an event may start before it or end after it). */
export function minutesIntoDay(date: Date, day: Date): number {
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return Math.min(MINUTES_PER_DAY, Math.max(0, Math.round((date.getTime() - midnight) / 60_000)));
}

/**
 * Places blocks side by side where they overlap. Blocks that chain together (A overlaps B,
 * B overlaps C) form one group and share one column count, so widths line up inside the group.
 */
export function layoutBlocks(blocks: TimedBlock[]): PlacedBlock[] {
  const visualEnd = (b: TimedBlock) => Math.max(b.endMin, b.startMin + MIN_BLOCK_MINUTES);
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin || visualEnd(b) - visualEnd(a));

  const placed: PlacedBlock[] = [];
  let group: PlacedBlock[] = [];
  let groupEnd = -1;
  let columnEnds: number[] = [];

  const closeGroup = () => {
    for (const block of group) block.columns = columnEnds.length;
    placed.push(...group);
    group = [];
    columnEnds = [];
  };

  for (const block of sorted) {
    if (group.length > 0 && block.startMin >= groupEnd) closeGroup();
    let column = columnEnds.findIndex((end) => end <= block.startMin);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(0);
    }
    columnEnds[column] = visualEnd(block);
    group.push({ ...block, column, columns: 1 });
    groupEnd = Math.max(groupEnd, visualEnd(block));
  }
  closeGroup();
  return placed;
}

/** The seven days of the week containing `day`. `weekStartsOn` follows `Date#getDay` (1 = Monday). */
export function weekDays(day: Date, weekStartsOn: number = 1): Date[] {
  const offset = (day.getDay() - weekStartsOn + 7) % 7;
  const start = addLocalDays(new Date(day.getFullYear(), day.getMonth(), day.getDate()), -offset);
  return Array.from({ length: 7 }, (_, i) => addLocalDays(start, i));
}
