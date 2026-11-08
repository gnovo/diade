import type { ExternalCalendar, ExternalEvent, Task } from '@diade/domain';
import { describe, expect, it } from 'vitest';
import { partnerDay } from './partnerDay';

const ME = 'me';
const SOFIA = 'sofia';
const NOW = new Date(2026, 10, 6, 15, 0); // Fri 6 Nov 2026, 15:00
const at = (m: number, d: number, h = 0, min = 0) => new Date(2026, m - 1, d, h, min).toISOString();

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  spaceId: 's',
  creatorId: ME,
  assigneeId: SOFIA,
  title: 'Book vet',
  notes: null,
  dueDate: null,
  status: 'todo',
  priority: 'normal',
  visibility: 'shared',
  completedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const calendar: ExternalCalendar = {
  id: 'cal-sofia',
  userId: SOFIA,
  name: 'Sofia',
  color: '#336699',
  timeZone: null,
  accessRole: 'owner',
  syncEnabled: true,
  visibility: 'shared',
  lastSyncedAt: null,
  lastError: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
};

const external = (over: Partial<ExternalEvent> = {}): ExternalEvent => ({
  id: 'x1',
  calendarId: 'cal-sofia',
  userId: SOFIA,
  googleEventId: 'g1',
  icalUid: null,
  title: 'Yoga',
  description: null,
  location: null,
  startAt: at(11, 6, 18),
  endAt: at(11, 6, 19),
  startDate: null,
  endDate: null,
  isAllDay: false,
  status: 'confirmed',
  transparency: 'opaque',
  myResponse: null,
  googleVisibility: null,
  visibilityOverride: null,
  htmlLink: null,
  isRecurringInstance: false,
  highlighted: false,
  effectiveVisibility: 'shared',
  redacted: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const run = (tasks: Task[] = [], externalEvents: ExternalEvent[] = []) =>
  partnerDay({
    tasks,
    externalEvents,
    externalCalendars: [calendar],
    userId: ME,
    partnerId: SOFIA,
    now: NOW,
  });

describe('partnerDay tasks', () => {
  it('keeps only open tasks assigned to the partner alone', () => {
    const result = run([
      task({ id: 'hers' }),
      task({ id: 'both', assigneeId: null }),
      task({ id: 'mine', assigneeId: ME }),
      task({ id: 'done', status: 'completed' }),
      task({ id: 'deleted', deletedAt: '2026-11-02T00:00:00.000Z' }),
    ]);
    expect(result.tasks.map((t) => t.id)).toEqual(['hers']);
  });

  it('never shows a task the partner marked personal', () => {
    const result = run([
      task({ id: 'private', visibility: 'personal', creatorId: SOFIA }),
      task({ id: 'shared', visibility: 'shared', creatorId: SOFIA }),
    ]);
    expect(result.tasks.map((t) => t.id)).toEqual(['shared']);
  });

  it('orders by due date with undated last', () => {
    const result = run([
      task({ id: 'undated', title: 'A' }),
      task({ id: 'later', dueDate: at(11, 20) }),
      task({ id: 'overdue', dueDate: at(11, 1) }),
    ]);
    expect(result.tasks.map((t) => t.id)).toEqual(['overdue', 'later', 'undated']);
  });
});

describe('partnerDay events', () => {
  it("shows only the partner's Google events, not mine", () => {
    const result = run(
      [],
      [external({ id: 'hers' }), external({ id: 'mine', userId: ME, calendarId: 'cal-me' })],
    );
    expect(result.events.map((e) => e.event.id)).toEqual(['hers']);
  });

  it('keeps a redacted event redacted', () => {
    const result = run([], [external({ redacted: true, title: null })]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].event.redacted).toBe(true);
    expect(result.events[0].event.title).toBeNull();
  });

  it('drops events that already ended today and counts what is left today', () => {
    const result = run(
      [],
      [
        external({ id: 'over', startAt: at(11, 6, 9), endAt: at(11, 6, 10) }),
        external({ id: 'tonight', startAt: at(11, 6, 18), endAt: at(11, 6, 19) }),
        external({ id: 'tomorrow', startAt: at(11, 7, 9), endAt: at(11, 7, 10) }),
        external({ id: 'nextweek', startAt: at(11, 13, 9), endAt: at(11, 13, 10) }),
      ],
    );
    expect(result.events.map((e) => e.event.id)).toEqual(['tonight', 'tomorrow']);
    expect(result.eventsToday).toBe(1);
  });

  it('keeps an all-day event for the whole day', () => {
    const result = run(
      [],
      [
        external({
          id: 'holiday',
          isAllDay: true,
          startAt: null,
          endAt: null,
          startDate: '2026-11-06',
          endDate: '2026-11-06',
        }),
      ],
    );
    expect(result.events.map((e) => e.event.id)).toEqual(['holiday']);
    expect(result.eventsToday).toBe(1);
  });
});
