/**
 * Training as blocks, not appointments (docs/plans/health, decisions 8 to 10).
 *
 * A block is a personal event with category `workout`: a window in which one session fits. A member has weekly
 * goals per kind of session, which differ between the two weeks of their work cycle. A session marked done in any
 * block of the week counts; a missed block costs nothing, and there are more blocks than the goal.
 *
 * The two-week cycle is an anchor (a week-1 Monday). A block that only happens in one week of the cycle repeats every
 * two weeks (`FREQ=WEEKLY;INTERVAL=2`); one that happens in both repeats every week.
 */

import { toDateInputValue } from './datetime';
import { daysBetween, parseDateOnly } from './importantDates';
import { weekStart } from './mealPlan';
import { expandEventOccurrences } from './recurrence';

export const WORKOUT_KINDS = ['strength', 'bodyweight', 'walk', 'other'] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];
/** The kinds that have a weekly goal. `other` blocks are planned but never counted. */
export const GOAL_KINDS = ['strength', 'bodyweight', 'walk'] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

/** What a `workout` event carries beyond the event itself. */
export interface WorkoutDetails {
  kind: WorkoutKind;
  /** The session that fits in the block, in minutes; the block itself is longer. */
  durationMin: number;
  /** The local days (`YYYY-MM-DD`) on which a session in this block was done. */
  done: string[];
}

/** At most this many done days are kept on a block: about a year of a weekly one. */
export const MAX_DONE_DAYS = 60;

export type CycleWeek = 1 | 2;
export type WeeklyGoals = Record<GoalKind, number>;

export interface TrainingSettings {
  /** A Monday that starts a week 1 of the member's work cycle (`YYYY-MM-DD`). */
  cycleAnchor: string;
  goals: Record<'week1' | 'week2', WeeklyGoals>;
}

export const DEFAULT_GOALS: TrainingSettings['goals'] = {
  week1: { strength: 3, bodyweight: 2, walk: 4 },
  week2: { strength: 2, bodyweight: 3, walk: 5 },
};

/** Which week of the cycle `date` falls in. A date before the anchor counts back in two-week steps. */
export function cycleWeek(anchor: string, date: Date): CycleWeek {
  const start = parseDateOnly(anchor);
  if (!start) return 1;
  const weeks = Math.floor(daysBetween(weekStart(start), weekStart(date)) / 7);
  return ((weeks % 2) + 2) % 2 === 0 ? 1 : 2;
}

/** The goals that apply in the week of `date`. */
export const goalsFor = (settings: TrainingSettings, date: Date): WeeklyGoals =>
  cycleWeek(settings.cycleAnchor, date) === 1 ? settings.goals.week1 : settings.goals.week2;

/** One recurring block in a template. `weekday` is 1 (Monday) to 7 (Sunday); times are local `HH:MM`. */
export interface BlockSpec {
  kind: WorkoutKind;
  weekday: number;
  start: string;
  end: string;
  /** The session that fits in the block, in minutes. */
  durationMin: number;
  weeks: 'both' | CycleWeek;
}

const weekdays = (days: number[], spec: Omit<BlockSpec, 'weekday'>): BlockSpec[] =>
  days.map((weekday) => ({ ...spec, weekday }));

/**
 * The default week from the brainstorm: round the four dog walks (07, 13, 17 and 21 h), nothing after 19:00, and the
 * two weeks of the work cycle (week 1 implementation, week 2 freezes and release). Batch prep is a block of kind
 * `other`: on the calendar, never counted.
 */
export const DEFAULT_TEMPLATE: readonly BlockSpec[] = [
  ...weekdays([1, 2, 3, 4, 5], {
    kind: 'walk',
    start: '09:30',
    end: '11:30',
    durationMin: 45,
    weeks: 'both',
  }),
  ...weekdays([3, 4], { kind: 'walk', start: '14:30', end: '16:30', durationMin: 45, weeks: 2 }),
  { kind: 'strength', weekday: 1, start: '17:30', end: '19:00', durationMin: 40, weeks: 'both' },
  { kind: 'strength', weekday: 3, start: '17:30', end: '19:00', durationMin: 40, weeks: 1 },
  { kind: 'strength', weekday: 5, start: '15:00', end: '16:30', durationMin: 40, weeks: 1 },
  { kind: 'strength', weekday: 6, start: '10:00', end: '11:30', durationMin: 40, weeks: 'both' },
  { kind: 'strength', weekday: 7, start: '10:00', end: '11:30', durationMin: 40, weeks: 2 },
  ...weekdays([2, 4], {
    kind: 'bodyweight',
    start: '12:00',
    end: '12:30',
    durationMin: 20,
    weeks: 'both',
  }),
  { kind: 'bodyweight', weekday: 3, start: '12:00', end: '12:30', durationMin: 20, weeks: 2 },
  { kind: 'bodyweight', weekday: 7, start: '17:30', end: '18:00', durationMin: 20, weeks: 'both' },
  { kind: 'other', weekday: 7, start: '10:00', end: '12:00', durationMin: 120, weeks: 1 },
  { kind: 'other', weekday: 7, start: '15:00', end: '17:00', durationMin: 120, weeks: 2 },
];

/** The blocks of a template in one week of the cycle. */
export const blocksInWeek = (template: readonly BlockSpec[], week: CycleWeek): BlockSpec[] =>
  template.filter((block) => block.weeks === 'both' || block.weeks === week);

/**
 * The template for these goals: a kind with a goal of 0 in a week has no blocks in that week, so a block planned for
 * both weeks keeps only the week that has a goal for it, and one with no such week is left out. Batch prep stays.
 */
export function templateFor(
  template: readonly BlockSpec[],
  goals: TrainingSettings['goals'],
): BlockSpec[] {
  const wanted = (spec: BlockSpec, week: CycleWeek) =>
    spec.kind === 'other' || goals[week === 1 ? 'week1' : 'week2'][spec.kind] > 0;
  return template.flatMap((spec): BlockSpec[] => {
    const weeks = ([1, 2] as const).filter(
      (week) => (spec.weeks === 'both' || spec.weeks === week) && wanted(spec, week),
    );
    if (weeks.length === 0) return [];
    return [{ ...spec, weeks: weeks.length === 2 ? 'both' : weeks[0] }];
  });
}

/** An event to create for a block: the caller adds the title (it is in the member's language) and visibility. */
export interface BlockEvent {
  spec: BlockSpec;
  startAt: string;
  endAt: string;
  recurrenceRule: string;
  category: 'workout';
  workout: WorkoutDetails;
}

const at = (day: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  result.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return result;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
};

/**
 * The template as recurring events, starting with the week of `today`. A block in one week of the cycle starts in the
 * first such week, this one or the next; a block whose first day has passed still starts this week, so its series is
 * anchored on the right weekday (only future occurrences matter to the member).
 */
export function templateEvents(
  template: readonly BlockSpec[],
  anchor: string,
  today: Date,
): BlockEvent[] {
  const monday = weekStart(today);
  const thisWeek = cycleWeek(anchor, today);
  return template.map((spec) => {
    const offsetWeeks = spec.weeks === 'both' || spec.weeks === thisWeek ? 0 : 1;
    const day = addDays(monday, offsetWeeks * 7 + spec.weekday - 1);
    return {
      spec,
      startAt: at(day, spec.start).toISOString(),
      endAt: at(day, spec.end).toISOString(),
      recurrenceRule: spec.weeks === 'both' ? 'FREQ=WEEKLY' : 'FREQ=WEEKLY;INTERVAL=2',
      category: 'workout',
      workout: { kind: spec.kind, durationMin: spec.durationMin, done: [] },
    };
  });
}

/** The block's details with `day` marked done (or not), newest days kept when the list is full. */
export function setDone(details: WorkoutDetails, day: Date, done: boolean): WorkoutDetails {
  const key = toDateInputValue(day);
  const others = details.done.filter((d) => d !== key);
  const next = done ? [...others, key].sort() : others;
  return { ...details, done: next.slice(-MAX_DONE_DAYS) };
}

export const isDoneOn = (details: WorkoutDetails, day: Date): boolean =>
  details.done.includes(toDateInputValue(day));

type WorkoutEvent = {
  startAt: string;
  endAt: string;
  recurrenceRule: string | null;
  category: string;
  deletedAt: string | null;
  workout?: WorkoutDetails | null;
};

export interface KindProgress {
  kind: GoalKind;
  done: number;
  goal: number;
}

/** How the week of `date` is going: sessions done per kind against that week's goals. */
export function weekProgress(
  events: readonly WorkoutEvent[],
  settings: TrainingSettings,
  date: Date,
): KindProgress[] {
  const monday = weekStart(date);
  const sunday = addDays(monday, 7);
  const done: Record<GoalKind, number> = { strength: 0, bodyweight: 0, walk: 0 };
  for (const event of events) {
    if (event.deletedAt || event.category !== 'workout' || !event.workout) continue;
    const kind = event.workout.kind;
    if (kind === 'other') continue;
    for (const occurrence of expandEventOccurrences(event, monday, sunday)) {
      if (occurrence.startAt < sunday && isDoneOn(event.workout, occurrence.startAt)) done[kind]++;
    }
  }
  const goals = goalsFor(settings, date);
  return GOAL_KINDS.map((kind) => ({ kind, done: done[kind], goal: goals[kind] }));
}

/** The next block today or later whose kind still needs a session this week, or null when the week is done. */
export function nextBlock<T extends WorkoutEvent>(
  events: readonly T[],
  settings: TrainingSettings,
  now: Date,
): { event: T; startAt: Date; endAt: Date } | null {
  const progress = new Map(weekProgress(events, settings, now).map((p) => [p.kind, p]));
  const sunday = addDays(weekStart(now), 7);
  let best: { event: T; startAt: Date; endAt: Date } | null = null;
  for (const event of events) {
    if (event.deletedAt || event.category !== 'workout' || !event.workout) continue;
    const kind = event.workout.kind;
    if (kind === 'other') continue;
    const goal = progress.get(kind);
    if (!goal || goal.done >= goal.goal) continue;
    for (const occurrence of expandEventOccurrences(event, now, sunday)) {
      if (occurrence.endAt <= now || isDoneOn(event.workout, occurrence.startAt)) continue;
      if (!best || occurrence.startAt < best.startAt) best = { event, ...occurrence };
      break;
    }
  }
  return best;
}
