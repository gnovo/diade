import { describe, expect, it } from 'vitest';
import { expandEventOccurrences } from './recurrence';
import {
  blocksInWeek,
  cycleWeek,
  DEFAULT_GOALS,
  DEFAULT_TEMPLATE,
  GOAL_KINDS,
  isDoneOn,
  MAX_DONE_DAYS,
  nextBlock,
  setDone,
  type TrainingSettings,
  templateEvents,
  type WorkoutDetails,
  weekProgress,
} from './training';

const day = (iso: string, time = '12:00') => new Date(`${iso}T${time}:00`);
const settings: TrainingSettings = { cycleAnchor: '2026-11-09', goals: DEFAULT_GOALS };

describe('cycleWeek', () => {
  it('alternates from the anchor, forwards and backwards', () => {
    expect(cycleWeek('2026-11-09', day('2026-11-12'))).toBe(1);
    expect(cycleWeek('2026-11-09', day('2026-11-16'))).toBe(2);
    expect(cycleWeek('2026-11-09', day('2026-11-23'))).toBe(1);
    expect(cycleWeek('2026-11-09', day('2026-11-08'))).toBe(2);
    expect(cycleWeek('2026-11-09', day('2026-10-26'))).toBe(1);
  });

  it('reads an anchor that is not a Monday as its week', () => {
    expect(cycleWeek('2026-11-11', day('2026-11-09'))).toBe(1);
  });
});

describe('the default template', () => {
  it('has more blocks than the goal for every kind, in both weeks', () => {
    for (const week of [1, 2] as const) {
      const goals = week === 1 ? DEFAULT_GOALS.week1 : DEFAULT_GOALS.week2;
      for (const kind of GOAL_KINDS) {
        const blocks = blocksInWeek(DEFAULT_TEMPLATE, week).filter((b) => b.kind === kind).length;
        expect(blocks, `${kind} in week ${week}`).toBeGreaterThan(goals[kind]);
      }
    }
  });

  it('plans nothing at or after 19:00, and nothing over a dog walk', () => {
    const walks = ['07:00', '13:00', '17:00', '21:00'];
    for (const block of DEFAULT_TEMPLATE) {
      expect(block.end <= '19:00', `${block.kind} ${block.weekday} ${block.start}`).toBe(true);
      for (const walk of walks) {
        // A block may share a walk's hour, but not start in its first half: the walk takes 20 to 30 minutes.
        const startsInWalk = block.start >= walk && block.start < `${walk.slice(0, 2)}:30`;
        expect(startsInWalk, `${block.kind} at ${block.start} starts during the ${walk} walk`).toBe(
          false,
        );
      }
    }
  });
});

describe('templateEvents', () => {
  // Thursday of week 1.
  const events = templateEvents(DEFAULT_TEMPLATE, '2026-11-09', day('2026-11-12'));

  it('starts every-week blocks this week and every-two-weeks blocks in their first cycle week', () => {
    const fridayStrength = events.find((e) => e.spec.kind === 'strength' && e.spec.weekday === 5);
    expect(fridayStrength?.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=2');
    expect(new Date(fridayStrength?.startAt ?? '').toDateString()).toBe(
      day('2026-11-13').toDateString(),
    );
    const sundayStrength = events.find((e) => e.spec.kind === 'strength' && e.spec.weekday === 7);
    expect(new Date(sundayStrength?.startAt ?? '').toDateString()).toBe(
      day('2026-11-22').toDateString(),
    );
    const mondayStrength = events.find((e) => e.spec.kind === 'strength' && e.spec.weekday === 1);
    expect(mondayStrength?.recurrenceRule).toBe('FREQ=WEEKLY');
  });

  it('keeps local times, and makes batch prep a block that is never counted', () => {
    const pad = events.find((e) => e.spec.kind === 'walk' && e.spec.weekday === 1);
    const start = new Date(pad?.startAt ?? '');
    expect([start.getHours(), start.getMinutes()]).toEqual([9, 30]);
    expect(events.filter((e) => e.spec.kind === 'other')).toHaveLength(2);
    expect(events.every((e) => e.category === 'workout' && e.workout.done.length === 0)).toBe(true);
  });

  it('lands a week-2 block only on week-2 days', () => {
    const wednesdayPad = events.find(
      (e) => e.spec.kind === 'walk' && e.spec.start === '14:30' && e.spec.weekday === 3,
    );
    if (!wednesdayPad) throw new Error('missing block');
    const dates = expandEventOccurrences(
      wednesdayPad,
      day('2026-11-09', '00:00'),
      day('2026-12-31', '00:00'),
    );
    expect(dates.length).toBeGreaterThan(2);
    for (const occurrence of dates) expect(cycleWeek('2026-11-09', occurrence.startAt)).toBe(2);
  });
});

describe('done days', () => {
  const details = { kind: 'strength' as const, durationMin: 40, done: [] as string[] };
  it('marks and unmarks a day', () => {
    const marked = setDone(details, day('2026-11-16'), true);
    expect(isDoneOn(marked, day('2026-11-16', '18:00'))).toBe(true);
    expect(setDone(marked, day('2026-11-16'), false).done).toEqual([]);
    expect(setDone(marked, day('2026-11-16'), true).done).toEqual(['2026-11-16']);
  });
  it('keeps only the newest days', () => {
    let many: WorkoutDetails = details;
    for (let i = 0; i < MAX_DONE_DAYS + 5; i++)
      many = setDone(many, new Date(2026, 0, 1 + i, 12), true);
    expect(many.done).toHaveLength(MAX_DONE_DAYS);
    expect(many.done[0]).toBe('2026-01-06');
  });
});

describe('weekProgress and nextBlock', () => {
  const block = (
    kind: 'strength' | 'bodyweight',
    start: string,
    end: string,
    done: string[] = [],
  ) => ({
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    recurrenceRule: 'FREQ=WEEKLY',
    category: 'workout',
    deletedAt: null,
    workout: { kind, durationMin: 40, done },
  });
  const monday = block('strength', '2026-11-09T17:30:00', '2026-11-09T19:00:00', [
    '2026-11-09',
    '2026-11-02',
  ]);
  const wednesday = block('strength', '2026-11-11T17:30:00', '2026-11-11T19:00:00');
  const tuesday = block('bodyweight', '2026-11-10T12:00:00', '2026-11-10T12:30:00', ['2026-11-10']);

  it('counts the sessions done this week against the week goals', () => {
    expect(weekProgress([monday, wednesday, tuesday], settings, day('2026-11-12'))).toEqual([
      { kind: 'strength', done: 1, goal: 3 },
      { kind: 'bodyweight', done: 1, goal: 2 },
      { kind: 'walk', done: 0, goal: 4 },
    ]);
  });

  it('uses the week-2 goals in week 2', () => {
    const week2 = weekProgress([monday], settings, day('2026-11-17'));
    expect(week2[0]).toEqual({ kind: 'strength', done: 0, goal: 2 });
  });

  it('offers the next block that still counts, skipping kinds already met', () => {
    const met = {
      ...settings,
      goals: { ...settings.goals, week1: { strength: 3, bodyweight: 1, walk: 0 } },
    };
    // On Thursday the strength blocks of this week are past and bodyweight is met: nothing left this week.
    expect(nextBlock([monday, wednesday, tuesday], met, day('2026-11-12', '09:00'))).toBeNull();
    const earlier = nextBlock([monday, wednesday, tuesday], met, day('2026-11-11', '09:00'));
    expect(earlier?.startAt.toDateString()).toBe(day('2026-11-11').toDateString());
  });
});
