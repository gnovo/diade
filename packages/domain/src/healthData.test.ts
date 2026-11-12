import { describe, expect, it } from 'vitest';
import { sessionKind, sessionMarks, type WatchSession, weightTrend } from './healthData';

const at = (iso: string) => new Date(iso);
const block = (
  id: string,
  kind: 'strength' | 'bodyweight' | 'walk' | 'other',
  start: string,
  end: string,
  done: string[] = [],
  recurrenceRule: string | null = 'FREQ=WEEKLY',
) => ({
  id,
  startAt: at(start).toISOString(),
  endAt: at(end).toISOString(),
  recurrenceRule,
  category: 'workout',
  deletedAt: null,
  workout: { kind, durationMin: 40, done },
});
const session = (id: string, type: number, start: string, end: string): WatchSession => ({
  id,
  exerciseType: type,
  startAt: at(start),
  endAt: at(end),
});

// Monday 2026-11-09: a walking pad block 09:30 to 11:30 and a strength block 17:30 to 19:00, both weekly.
const pad = block('pad', 'walk', '2026-11-09T09:30:00', '2026-11-09T11:30:00');
const strength = block('strength', 'strength', '2026-11-09T17:30:00', '2026-11-09T19:00:00');
const WALKING = 79;
const STRENGTH_TRAINING = 70;

describe('sessionKind', () => {
  it('maps the exercise types of the blocks and nothing else', () => {
    expect(sessionKind(STRENGTH_TRAINING)).toBe('strength');
    expect(sessionKind(83)).toBe('bodyweight');
    expect(sessionKind(57)).toBe('walk');
    expect(sessionKind(8)).toBeNull();
  });
});

describe('sessionMarks', () => {
  it('marks the block of the same kind a session overlaps, on that day', () => {
    const marks = sessionMarks(
      [pad, strength],
      [session('s1', STRENGTH_TRAINING, '2026-11-16T18:10:00', '2026-11-16T18:55:00')],
      new Set(),
    );
    expect(marks).toEqual([{ eventId: 'strength', day: '2026-11-16', sessionId: 's1' }]);
  });

  it('counts a session that only overlaps the edge of the window', () => {
    const marks = sessionMarks(
      [strength],
      [session('late', STRENGTH_TRAINING, '2026-11-09T18:45:00', '2026-11-09T19:30:00')],
      new Set(),
    );
    expect(marks).toHaveLength(1);
  });

  it('ignores a dog walk that overlaps no walking block, and a short or unknown session', () => {
    const marks = sessionMarks(
      [pad, strength],
      [
        session('dog', WALKING, '2026-11-09T13:00:00', '2026-11-09T13:25:00'),
        session('short', WALKING, '2026-11-09T10:00:00', '2026-11-09T10:05:00'),
        session('bike', 8, '2026-11-09T10:00:00', '2026-11-09T11:00:00'),
      ],
      new Set(),
    );
    expect(marks).toEqual([]);
  });

  it('never marks a block of another kind', () => {
    const marks = sessionMarks(
      [strength],
      [session('walk', WALKING, '2026-11-09T17:30:00', '2026-11-09T18:30:00')],
      new Set(),
    );
    expect(marks).toEqual([]);
  });

  it('skips a day already done, and sessions used before', () => {
    const doneMonday = block('strength', 'strength', '2026-11-09T17:30:00', '2026-11-09T19:00:00', [
      '2026-11-09',
    ]);
    const s = session('s1', STRENGTH_TRAINING, '2026-11-09T18:00:00', '2026-11-09T18:40:00');
    expect(sessionMarks([doneMonday], [s], new Set())).toEqual([]);
    expect(sessionMarks([strength], [s], new Set(['s1']))).toEqual([]);
  });

  it('gives two sessions in one window one mark, and picks the block overlapped most', () => {
    const second = block('second', 'walk', '2026-11-09T11:00:00', '2026-11-09T12:00:00');
    const marks = sessionMarks(
      [pad, second],
      [
        session('a', WALKING, '2026-11-09T10:00:00', '2026-11-09T10:40:00'),
        session('b', WALKING, '2026-11-09T10:50:00', '2026-11-09T11:50:00'),
      ],
      new Set(),
    );
    expect(marks).toEqual([
      { eventId: 'pad', day: '2026-11-09', sessionId: 'a' },
      { eventId: 'second', day: '2026-11-09', sessionId: 'b' },
    ]);
  });

  it('follows the every-two-weeks rule', () => {
    const fortnightly = block(
      'f',
      'strength',
      '2026-11-13T15:00:00',
      '2026-11-13T16:30:00',
      [],
      'FREQ=WEEKLY;INTERVAL=2',
    );
    const offWeek = session('off', STRENGTH_TRAINING, '2026-11-20T15:10:00', '2026-11-20T15:50:00');
    const onWeek = session('on', STRENGTH_TRAINING, '2026-11-27T15:10:00', '2026-11-27T15:50:00');
    expect(sessionMarks([fortnightly], [offWeek, onWeek], new Set())).toEqual([
      { eventId: 'f', day: '2026-11-27', sessionId: 'on' },
    ]);
  });
});

describe('weightTrend', () => {
  const now = at('2026-11-12T20:00:00');

  it('is empty with no weigh-ins', () => {
    expect(weightTrend([], now)).toEqual({ points: [], current: null, change: null });
  });

  it('averages the last 7 days and compares them with the 7 before', () => {
    const trend = weightTrend(
      [
        { at: at('2026-11-01T08:00:00'), kg: 87.4 },
        { at: at('2026-11-03T08:00:00'), kg: 87.0 },
        { at: at('2026-11-08T08:00:00'), kg: 86.8 },
        { at: at('2026-11-11T08:00:00'), kg: 86.2 },
      ],
      now,
    );
    expect(trend.current).toBe(86.5);
    expect(trend.change).toBe(-0.7);
    expect(trend.points.map((p) => p.kg)).toEqual([87.4, 87.2, 86.9, 86.5]);
  });

  it('has no change without a weigh-in in the week before, and leaves out old and future ones', () => {
    const trend = weightTrend(
      [
        { at: at('2026-08-01T08:00:00'), kg: 90 },
        { at: at('2026-11-10T08:00:00'), kg: 86.4 },
        { at: at('2026-11-13T08:00:00'), kg: 80 },
      ],
      now,
    );
    expect(trend.points).toHaveLength(1);
    expect(trend.current).toBe(86.4);
    expect(trend.change).toBeNull();
  });
});
