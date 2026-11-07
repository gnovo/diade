import { describe, it, expect } from 'vitest';
import type { CalendarEvent, ExternalCalendar, ExternalEvent, ImportantDate, Task } from '@diade/domain';
import {
  buildUnifiedAgenda,
  dedupeExternalEvents,
  dropGoogleDuplicatesOfDates,
  pickHighlights,
  type AgendaEntry,
} from './unifiedAgenda';

const ME = 'me';
const PARTNER = 'partner';
const FROM = new Date(2026, 10, 5); // 5 Nov 2026, local midnight
const TO = new Date(2027, 0, 4);

const local = (m: number, d: number, h = 0, min = 0) => new Date(2026, m - 1, d, h, min).toISOString();

const calendar = (over: Partial<ExternalCalendar> = {}): ExternalCalendar => ({
  id: 'cal-me',
  userId: ME,
  name: 'Mine',
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
  ...over,
});

const external = (over: Partial<ExternalEvent> = {}): ExternalEvent => ({
  id: 'x1',
  calendarId: 'cal-me',
  userId: ME,
  googleEventId: 'g1',
  icalUid: null,
  title: 'Dentist',
  description: null,
  location: null,
  startAt: local(11, 10, 9),
  endAt: local(11, 10, 10),
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

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  spaceId: 's',
  creatorId: ME,
  assigneeId: null,
  title: 'Pay rent',
  notes: null,
  dueDate: local(11, 10, 23, 59),
  status: 'todo',
  priority: 'normal',
  visibility: 'shared',
  completedAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const event = (over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  spaceId: 's',
  creatorId: ME,
  title: 'Dinner',
  description: null,
  startAt: local(11, 10, 19, 30),
  endAt: local(11, 10, 21),
  isAllDay: false,
  visibility: 'shared',
  recurrenceRule: null,
  category: 'general',
  highlighted: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const date = (over: Partial<ImportantDate> = {}): ImportantDate => ({
  id: 'd1',
  spaceId: 's',
  creatorId: ME,
  title: 'Anniversary',
  type: 'first_day',
  notes: null,
  personName: null,
  date: '2020-11-10',
  countFirstDay: false,
  repeat: 'yearly',
  pinned: false,
  alertOffsetDays: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildUnifiedAgenda>[0]> = {}) =>
  buildUnifiedAgenda({
    events: [],
    externalEvents: [],
    externalCalendars: [calendar()],
    tasks: [],
    importantDates: [],
    userId: ME,
    from: FROM,
    to: TO,
    ...over,
  });

const kinds = (entries: AgendaEntry[]) => entries.map((e) => e.kind);
const dayOf = (agenda: ReturnType<typeof build>, m: number, d: number) =>
  agenda.days.find((x) => x.day.getMonth() === m - 1 && x.day.getDate() === d)?.entries ?? [];

describe('buildUnifiedAgenda: ordering within a day', () => {
  it('puts important dates, important tasks and all-day items before timed ones', () => {
    const agenda = build({
      events: [event()],
      externalEvents: [external(), external({ id: 'x2', isAllDay: true, startAt: null, endAt: null, startDate: '2026-11-10', endDate: '2026-11-10' })],
      tasks: [task({ id: 'normal' }), task({ id: 'imp', priority: 'important' })],
      importantDates: [date()],
    });
    const entries = dayOf(agenda, 11, 10);
    expect(kinds(entries)).toEqual(['important_date', 'task', 'external', 'task', 'external', 'event']);
    expect((entries[1] as Extract<AgendaEntry, { kind: 'task' }>).task.id).toBe('imp');
    expect((entries[2] as Extract<AgendaEntry, { kind: 'external' }>).isAllDay).toBe(true);
    // Timed items are ordered by start: dentist 09:00 before dinner 19:30.
    expect((entries[4] as Extract<AgendaEntry, { kind: 'external' }>).event.id).toBe('x1');
  });

  it('sorts completed tasks last', () => {
    const agenda = build({ tasks: [task({ id: 'done', status: 'completed' }), task({ id: 'open' })], events: [event()] });
    const last = dayOf(agenda, 11, 10).at(-1)!;
    expect(last.kind).toBe('task');
    expect((last as Extract<AgendaEntry, { kind: 'task' }>).task.id).toBe('done');
  });

  it('groups by day in date order', () => {
    const agenda = build({ events: [event({ startAt: local(11, 12, 9), endAt: local(11, 12, 10) }), event({ id: 'e2' })] });
    expect(agenda.days.map((d) => d.day.getDate())).toEqual([10, 12]);
  });
});

describe('Google events', () => {
  it('spreads a multi-day all-day event over every day it covers, within the window', () => {
    const agenda = build({
      externalEvents: [external({ isAllDay: true, startAt: null, endAt: null, startDate: '2026-11-10', endDate: '2026-11-12' })],
    });
    expect(agenda.days.map((d) => d.day.getDate())).toEqual([10, 11, 12]);
  });

  it('clips an all-day event that started before the window', () => {
    const agenda = build({
      externalEvents: [external({ isAllDay: true, startAt: null, endAt: null, startDate: '2026-11-03', endDate: '2026-11-06' })],
    });
    expect(agenda.days.map((d) => d.day.getDate())).toEqual([5, 6]);
  });

  it('hides tombstones and events of hidden calendars', () => {
    const agenda = build({
      externalEvents: [external({ deletedAt: '2026-11-02T00:00:00.000Z' }), external({ id: 'x3', calendarId: 'cal-hidden' })],
      hiddenCalendarIds: new Set(['cal-hidden']),
    });
    expect(agenda.days).toHaveLength(0);
  });

  it('filters by whose calendar it is, but never filters Díade events, tasks or dates', () => {
    const base = {
      externalEvents: [external(), external({ id: 'x-partner', userId: PARTNER, calendarId: 'cal-p' })],
      events: [event()],
      tasks: [task()],
      importantDates: [date()],
    };
    const count = (agenda: ReturnType<typeof build>, kind: AgendaEntry['kind']) =>
      agenda.days.flatMap((d) => d.entries).filter((e) => e.kind === kind).length;

    const me = build({ ...base, googleScope: 'me' });
    expect(count(me, 'external')).toBe(1);
    const partner = build({ ...base, googleScope: 'partner' });
    expect(count(partner, 'external')).toBe(1);
    expect(count(build({ ...base, googleScope: 'both' }), 'external')).toBe(2);
    for (const a of [me, partner]) {
      expect(count(a, 'event')).toBe(1);
      expect(count(a, 'task')).toBe(1);
      expect(count(a, 'important_date')).toBe(1);
    }
  });

  it('attaches the owning calendar and marks the viewer\'s own events', () => {
    const agenda = build({ externalEvents: [external()] });
    const entry = dayOf(agenda, 11, 10)[0] as Extract<AgendaEntry, { kind: 'external' }>;
    expect(entry.mine).toBe(true);
    expect(entry.calendar?.name).toBe('Mine');
  });
});

describe('dedupeExternalEvents', () => {
  it('keeps the viewer\'s copy when both members synced the same shared event', () => {
    const mine = external({ icalUid: 'u1' });
    const theirs = external({ id: 'x2', userId: PARTNER, icalUid: 'u1' });
    expect(dedupeExternalEvents([theirs, mine], ME).map((e) => e.id)).toEqual(['x1']);
  });

  it('keeps a single partner copy when the viewer does not have the event', () => {
    const a = external({ id: 'a', userId: PARTNER, icalUid: 'u1' });
    expect(dedupeExternalEvents([a], ME)).toHaveLength(1);
  });

  it('drops a partner busy block that coincides exactly with one of the viewer\'s events', () => {
    const mine = external();
    const busy = external({ id: 'busy', userId: PARTNER, title: null, redacted: true });
    expect(dedupeExternalEvents([mine, busy], ME).map((e) => e.id)).toEqual(['x1']);
  });

  it('keeps a partner busy block at a different time', () => {
    const busy = external({ id: 'busy', userId: PARTNER, title: null, redacted: true, startAt: local(11, 10, 14), endAt: local(11, 10, 15) });
    expect(dedupeExternalEvents([external(), busy], ME)).toHaveLength(2);
  });

  it('does not treat two different appointments with the same title as duplicates', () => {
    const a = external({ icalUid: 'u1' });
    const b = external({ id: 'x2', icalUid: 'u2' });
    expect(dedupeExternalEvents([a, b], ME)).toHaveLength(2);
  });
});

describe('tasks', () => {
  it('places a task on its due day, ignoring the time of day', () => {
    const agenda = build({ tasks: [task({ dueDate: local(11, 10, 23, 59) })] });
    expect(dayOf(agenda, 11, 10)).toHaveLength(1);
  });

  it('leaves tasks without a due date off the calendar', () => {
    expect(build({ tasks: [task({ dueDate: null })] }).days).toHaveLength(0);
  });

  it('reports open tasks from earlier days as overdue, oldest first, and never as day rows', () => {
    const agenda = build({
      today: FROM,
      tasks: [
        task({ id: 'older', dueDate: local(10, 20, 23, 59) }),
        task({ id: 'old', dueDate: local(11, 1, 23, 59) }),
        task({ id: 'today', dueDate: local(11, 5, 23, 59) }),
      ],
    });
    expect(agenda.overdue.map((t) => t.id)).toEqual(['older', 'old']);
    expect(agenda.days.flatMap((d) => d.entries).map((e) => (e as any).task?.id)).toEqual(['today']);
  });

  it('does not report completed tasks as overdue', () => {
    const agenda = build({ tasks: [task({ dueDate: local(10, 20, 23, 59), status: 'completed' })] });
    expect(agenda.overdue).toHaveLength(0);
  });

  it('omits deleted tasks', () => {
    expect(build({ tasks: [task({ deletedAt: '2026-11-02T00:00:00.000Z' })] }).days).toHaveLength(0);
  });
});

describe('important dates', () => {
  it('shows a yearly date on its anniversary inside the window', () => {
    const agenda = build({ importantDates: [date()] });
    expect(dayOf(agenda, 11, 10).map((e) => e.kind)).toEqual(['important_date']);
  });

  it('shows a one-off date only on its own day', () => {
    expect(build({ importantDates: [date({ repeat: 'none', date: '2026-11-20' })] }).days.map((d) => d.day.getDate())).toEqual([20]);
    expect(build({ importantDates: [date({ repeat: 'none', date: '2020-11-10' })] }).days).toHaveLength(0);
  });

  it('does not show a yearly date before its first year', () => {
    expect(build({ importantDates: [date({ date: '2030-11-10' })] }).days).toHaveLength(0);
  });

  it('keeps a 29 February date on 28 February in a non-leap year', () => {
    const agenda = buildUnifiedAgenda({
      events: [], externalEvents: [], externalCalendars: [], tasks: [], userId: ME,
      importantDates: [date({ date: '2020-02-29' })],
      from: new Date(2027, 1, 1),
      to: new Date(2027, 2, 15),
    });
    expect(agenda.days.map((d) => d.day.getDate())).toEqual([28]);
  });
});

describe('pickHighlights', () => {
  const NOW = new Date(2026, 10, 10, 12, 0); // 10 Nov 2026, midday
  const build = (over: Partial<Parameters<typeof buildUnifiedAgenda>[0]>) =>
    buildUnifiedAgenda({
      events: [],
      externalEvents: [],
      externalCalendars: [calendar()],
      tasks: [],
      importantDates: [],
      userId: ME,
      from: new Date(2026, 10, 10),
      to: new Date(2027, 0, 10),
      ...over,
    });
  const titles = (entries: AgendaEntry[]) =>
    entries.map((e) => (e.kind === 'event' ? e.item.title : e.kind === 'external' ? e.event.title : e.kind));

  it('returns only starred events, Díade and Google together, soonest first', () => {
    const agenda = build({
      events: [event({ id: 'a', title: 'Plain', highlighted: false }), event({ id: 'b', title: 'Starred dinner', highlighted: true, startAt: local(11, 12, 19), endAt: local(11, 12, 21) })],
      externalEvents: [external({ id: 'x', title: 'Starred dentist', highlighted: true, startAt: local(11, 11, 9), endAt: local(11, 11, 10) }), external({ id: 'y', title: 'Plain', highlighted: false })],
    });
    expect(titles(pickHighlights(agenda, NOW))).toEqual(['Starred dentist', 'Starred dinner']);
  });

  it('drops events that have already ended today, but keeps one still running', () => {
    const agenda = build({
      externalEvents: [
        external({ id: 'over', title: 'Over', highlighted: true, startAt: local(11, 10, 9), endAt: local(11, 10, 10) }),
        external({ id: 'now', title: 'Running', highlighted: true, startAt: local(11, 10, 11), endAt: local(11, 10, 13) }),
      ],
    });
    expect(titles(pickHighlights(agenda, NOW))).toEqual(['Running']);
  });

  it('keeps an all-day event through its day', () => {
    const agenda = build({
      externalEvents: [external({ id: 'ad', title: 'Conference', highlighted: true, isAllDay: true, startAt: null, endAt: null, startDate: '2026-11-10', endDate: '2026-11-10' })],
    });
    expect(titles(pickHighlights(agenda, NOW))).toEqual(['Conference']);
  });

  it('is not narrowed by the calendar filters', () => {
    const agenda = build({
      externalEvents: [external({ id: 'x', title: 'Starred', highlighted: true, startAt: local(11, 11, 9), endAt: local(11, 11, 10) })],
    });
    expect(titles(pickHighlights(agenda, NOW))).toEqual(['Starred']);
    // The same event disappears from a filtered Calendar view, but the Today picker builds its own unfiltered agenda.
    const filtered = build({
      externalEvents: [external({ id: 'x', highlighted: true, startAt: local(11, 11, 9), endAt: local(11, 11, 10) })],
      hiddenCalendarIds: new Set(['cal-me']),
    });
    expect(pickHighlights(filtered, NOW)).toEqual([]);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      external({ id: `m${i}`, googleEventId: `g${i}`, title: `E${i}`, highlighted: true, startAt: local(11, 11 + i, 9), endAt: local(11, 11 + i, 10) }),
    );
    expect(pickHighlights(build({ externalEvents: many }), NOW, 3)).toHaveLength(3);
  });
});

describe("other people's dates on the calendar", () => {
  const marta = (over: Partial<ImportantDate> = {}) =>
    date({ id: 'marta', title: "Marta's birthday", type: 'their_birthday', personName: 'Marta', date: '1990-11-12', ...over });
  const googleBirthday = (over: Partial<ExternalEvent> = {}) =>
    external({
      id: 'gb',
      title: "Marta Silva's birthday",
      isAllDay: true,
      startAt: null,
      endAt: null,
      startDate: '2026-11-12',
      endDate: '2026-11-12',
      ...over,
    });

  const kinds = (input: Partial<Parameters<typeof buildUnifiedAgenda>[0]>) =>
    buildUnifiedAgenda({
      events: [],
      externalEvents: [],
      externalCalendars: [calendar()],
      tasks: [],
      importantDates: [],
      userId: ME,
      from: FROM,
      to: TO,
      ...input,
    })
      .days.flatMap((d) => d.entries)
      .map((e) => e.kind);

  it('shows them by default', () => {
    expect(kinds({ importantDates: [marta()] })).toEqual(['important_date']);
  });

  it('hides them, and only them, when switched off', () => {
    const couple = date({ id: 'us', type: 'first_day', date: '2020-11-10' });
    expect(kinds({ importantDates: [marta(), couple], showOthersDates: false })).toEqual(['important_date']);
    expect(kinds({ importantDates: [marta()], showOthersDates: false })).toEqual([]);
  });

  it('hides the Google birthday for the same person on the same day', () => {
    expect(kinds({ importantDates: [marta()], externalEvents: [googleBirthday()] })).toEqual(['important_date']);
  });

  it('keeps the Google birthday when the dates are switched off, so it is not lost', () => {
    expect(kinds({ importantDates: [marta()], externalEvents: [googleBirthday()], showOthersDates: false })).toEqual([
      'external',
    ]);
  });

  it('keeps unrelated Google events', () => {
    const ev = [
      googleBirthday({ id: 'other-day', startDate: '2026-11-13', endDate: '2026-11-13' }),
      googleBirthday({ id: 'other-person', title: "Joana's birthday" }),
      external({ id: 'meeting', title: 'Lunch with Marta', isAllDay: false }),
    ];
    expect(dropGoogleDuplicatesOfDates(ev, [marta()]).map((e) => e.id)).toEqual(['other-day', 'other-person', 'meeting']);
  });

  it('matches names regardless of accents and case', () => {
    const joao = marta({ personName: 'João', date: '1988-11-12' });
    expect(dropGoogleDuplicatesOfDates([googleBirthday({ title: 'ANIVERSÁRIO DE JOAO' })], [joao])).toEqual([]);
  });
});
