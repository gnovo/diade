/**
 * Watch data from Health Connect (docs/plans/health, H6), as plain values: the app reads the records on the phone
 * and these functions decide what they mean. Pure, so they are tested without a device.
 */

import { toDateInputValue } from './datetime';
import { expandEventOccurrences } from './recurrence';
import { type GoalKind, isDoneOn, type WorkoutDetails } from './training';

/** An exercise session a watch (or any app) wrote to Health Connect. `exerciseType` is Health Connect's number. */
export interface WatchSession {
  id: string;
  exerciseType: number;
  startAt: Date;
  endAt: Date;
}

/** Shorter sessions (a few steps logged as a walk) never mark a block done. */
export const MIN_SESSION_MINUTES = 10;

/**
 * Health Connect exercise types (`ExerciseSessionRecord.EXERCISE_TYPE_*`) and the goal they count towards. Anything
 * else (running outside, cycling, a match) is not one of the blocks, so it marks nothing.
 */
const EXERCISE_KINDS: Readonly<Record<number, GoalKind>> = {
  70: 'strength', // STRENGTH_TRAINING
  81: 'strength', // WEIGHTLIFTING
  13: 'bodyweight', // CALISTHENICS
  36: 'bodyweight', // HIGH_INTENSITY_INTERVAL_TRAINING
  48: 'bodyweight', // PILATES
  71: 'bodyweight', // STRETCHING
  83: 'bodyweight', // YOGA
  79: 'walk', // WALKING
  57: 'walk', // RUNNING_TREADMILL
};

export const sessionKind = (exerciseType: number): GoalKind | null =>
  EXERCISE_KINDS[exerciseType] ?? null;

type BlockEvent = {
  id: string;
  startAt: string;
  endAt: string;
  recurrenceRule: string | null;
  category: string;
  deletedAt: string | null;
  workout?: WorkoutDetails | null;
};

/** A block occurrence a session marks done: the event, the day (YYYY-MM-DD) and the session that did it. */
export interface SessionMark {
  eventId: string;
  day: string;
  sessionId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The blocks the sessions mark done. A session counts for the block of its kind that it overlaps most, on a day that
 * block is not done yet; a session that overlaps no block of its kind marks nothing (a dog walk at 13:00 does not
 * tick the walking pad at 14:30). Sessions in `applied` were used before and are skipped, so a day the member
 * unmarks stays unmarked.
 */
export function sessionMarks(
  events: readonly BlockEvent[],
  sessions: readonly WatchSession[],
  applied: ReadonlySet<string>,
): SessionMark[] {
  const marks: SessionMark[] = [];
  const marked = new Set<string>();
  const sorted = [...sessions].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  for (const session of sorted) {
    if (applied.has(session.id)) continue;
    const kind = sessionKind(session.exerciseType);
    const minutes = (session.endAt.getTime() - session.startAt.getTime()) / 60000;
    if (!kind || minutes < MIN_SESSION_MINUTES) continue;

    let best: { eventId: string; day: string; overlap: number } | null = null;
    for (const event of events) {
      if (event.deletedAt || event.category !== 'workout' || event.workout?.kind !== kind) continue;
      const window = expandEventOccurrences(
        event,
        new Date(session.startAt.getTime() - DAY_MS),
        new Date(session.endAt.getTime() + DAY_MS),
      );
      for (const occurrence of window) {
        const overlap =
          Math.min(occurrence.endAt.getTime(), session.endAt.getTime()) -
          Math.max(occurrence.startAt.getTime(), session.startAt.getTime());
        if (overlap <= 0) continue;
        const day = toDateInputValue(occurrence.startAt);
        if (isDoneOn(event.workout, occurrence.startAt) || marked.has(`${event.id}:${day}`))
          continue;
        if (!best || overlap > best.overlap) best = { eventId: event.id, day, overlap };
      }
    }
    if (best) {
      marked.add(`${best.eventId}:${best.day}`);
      marks.push({ eventId: best.eventId, day: best.day, sessionId: session.id });
    }
  }
  return marks;
}

/** A weigh-in: from a smart scale through Health Connect, or typed in the app (which writes it there too). */
export interface WeightEntry {
  at: Date;
  kg: number;
}

/** What a typed weigh-in may be. */
export const WEIGHT_LIMITS = { min: 30, max: 300 } as const;

export interface WeightTrend {
  /** One point per weigh-in: the mean of the weigh-ins of the 7 days up to it, so one heavy morning barely moves it. */
  points: Array<{ at: Date; kg: number }>;
  /** The mean of the last 7 days, or null when there was no weigh-in in them. */
  current: number | null;
  /** `current` minus the mean of the 7 days before, or null when either is missing. */
  change: number | null;
}

const WEEK_MS = 7 * DAY_MS;

function meanIn(entries: readonly WeightEntry[], from: number, to: number): number | null {
  const inside = entries.filter((e) => e.at.getTime() > from && e.at.getTime() <= to);
  if (inside.length === 0) return null;
  return inside.reduce((sum, e) => sum + e.kg, 0) / inside.length;
}

const round1 = (kg: number) => Math.round(kg * 10) / 10;

/** The 7-day trend of the weigh-ins in the last `days` days, not the daily number. */
export function weightTrend(entries: readonly WeightEntry[], now: Date, days = 56): WeightTrend {
  const end = now.getTime();
  const sorted = [...entries]
    .filter((e) => e.at.getTime() <= end)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const points = sorted
    .filter((e) => e.at.getTime() > end - days * DAY_MS)
    .map((e) => {
      const kg = meanIn(sorted, e.at.getTime() - WEEK_MS, e.at.getTime());
      return { at: e.at, kg: round1(kg ?? e.kg) };
    });
  const current = meanIn(sorted, end - WEEK_MS, end);
  const before = meanIn(sorted, end - 2 * WEEK_MS, end - WEEK_MS);
  return {
    points,
    current: current === null ? null : round1(current),
    change: current === null || before === null ? null : round1(current - before),
  };
}
