/**
 * One agenda from every source: Díade events, Google events, tasks with a due date and
 * important dates. Pure, so the ordering and filtering rules are unit tested.
 * See docs/architecture/calendar-sync-v1.md ("Mobile UX").
 */
import {
  addLocalDays,
  anniversaryInYear,
  type CalendarEvent,
  type ExternalCalendar,
  type ExternalEvent,
  type ImportantDate,
  isSameLocalDay,
  isThirdPartyDate,
  parseDateOnly,
  startOfLocalDay,
  type Task,
} from '@diade/domain';
import { type AgendaItem, buildAgenda } from './agenda';

/** Whose Google calendars to show. Díade's own events, tasks and dates always show. */
export type GoogleScope = 'both' | 'me' | 'partner';

export type AgendaEntry =
  | { kind: 'event'; key: string; day: Date; item: AgendaItem }
  | {
      kind: 'external';
      key: string;
      day: Date;
      event: ExternalEvent;
      calendar: ExternalCalendar | null;
      mine: boolean;
      isAllDay: boolean;
      startAt: Date | null;
      endAt: Date | null;
    }
  | { kind: 'task'; key: string; day: Date; task: Task }
  | { kind: 'important_date'; key: string; day: Date; item: ImportantDate };

export interface AgendaDay {
  day: Date;
  entries: AgendaEntry[];
}

export interface UnifiedAgendaInput {
  events: CalendarEvent[];
  externalEvents: ExternalEvent[];
  externalCalendars: ExternalCalendar[];
  tasks: Task[];
  importantDates: ImportantDate[];
  userId: string;
  from: Date;
  to: Date;
  googleScope?: GoogleScope;
  /**
   * Show birthdays and anniversaries of other people (dates with a person's name). Defaults to on.
   * When on, Google events for the same person on the same day are hidden so nothing shows twice.
   */
  showOthersDates?: boolean;
  hiddenCalendarIds?: ReadonlySet<string>;
  /** Open tasks due before this day are reported as overdue. Defaults to `from`. */
  today?: Date;
}

export interface UnifiedAgenda {
  days: AgendaDay[];
  /** Open tasks past their due day, oldest first. They stay visible until resolved. */
  overdue: Task[];
}

const DAY_MS = 86_400_000;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Display order inside a day. Lower comes first; timed items follow by start time. */
const RANK = {
  importantDate: 0,
  importantTask: 1,
  allDay: 2,
  task: 3,
  timed: 4,
  doneTask: 5,
} as const;

function rankOf(entry: AgendaEntry): number {
  switch (entry.kind) {
    case 'important_date':
      return RANK.importantDate;
    case 'task':
      if (entry.task.status === 'completed') return RANK.doneTask;
      return entry.task.priority === 'important' ? RANK.importantTask : RANK.task;
    case 'event':
      return entry.item.isAllDay ? RANK.allDay : RANK.timed;
    case 'external':
      return entry.isAllDay ? RANK.allDay : RANK.timed;
  }
}

const timeOf = (entry: AgendaEntry): number => {
  if (entry.kind === 'event') return entry.item.startAt.getTime();
  if (entry.kind === 'external') return entry.startAt?.getTime() ?? 0;
  return 0;
};

export function compareEntries(a: AgendaEntry, b: AgendaEntry): number {
  return rankOf(a) - rankOf(b) || timeOf(a) - timeOf(b) || a.key.localeCompare(b.key);
}

/**
 * Drops Google events that are the same appointment seen twice, which happens when both
 * members sync a shared calendar. The viewer's own copy wins. A partner's busy-only block
 * (no title, no iCal id) is dropped when the viewer has an event at exactly the same time.
 */
export function dedupeExternalEvents(events: ExternalEvent[], userId: string): ExternalEvent[] {
  const when = (e: ExternalEvent) =>
    e.isAllDay ? `d:${e.startDate}:${e.endDate}` : `t:${e.startAt}:${e.endAt}`;
  const mineByUid = new Set(
    events.filter((e) => e.userId === userId && e.icalUid).map((e) => `${e.icalUid}|${when(e)}`),
  );
  const mineByTime = new Set(events.filter((e) => e.userId === userId).map(when));
  const seenPartnerUid = new Set<string>();

  return events.filter((e) => {
    if (e.userId === userId) return true;
    if (e.icalUid) {
      const k = `${e.icalUid}|${when(e)}`;
      if (mineByUid.has(k) || seenPartnerUid.has(k)) return false;
      seenPartnerUid.add(k);
      return true;
    }
    return !(e.redacted && mineByTime.has(when(e)));
  });
}

const fold = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const wordsOf = (text: string): string[] =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Drops all-day Google events (typically the Birthdays calendar) that repeat a date the
 * member added for someone else: same day of the year and the person's first name appears
 * in the event title. Matching on the first name keeps "Marta" and "Marta Silva's birthday"
 * together, and the day check keeps an unrelated "Marta" meeting out of it.
 */
export function dropGoogleDuplicatesOfDates(
  events: ExternalEvent[],
  dates: ImportantDate[],
): ExternalEvent[] {
  const people = dates
    .filter((d) => !d.deletedAt && isThirdPartyDate(d.type) && d.personName)
    .map((d) => ({ first: wordsOf(d.personName!)[0], monthDay: d.date.slice(5) }))
    .filter((p): p is { first: string; monthDay: string } => Boolean(p.first));
  if (people.length === 0) return events;

  return events.filter((event) => {
    if (!event.isAllDay || !event.startDate || !event.title) return true;
    const monthDay = event.startDate.slice(5);
    const words = wordsOf(event.title);
    return !people.some((p) => p.monthDay === monthDay && words.includes(p.first));
  });
}

function importantDateOccurrences(item: ImportantDate, from: Date, to: Date): Date[] {
  const original = parseDateOnly(item.date);
  if (!original) return [];
  const inRange = (d: Date) => d.getTime() >= from.getTime() && d.getTime() < to.getTime();
  if (item.repeat !== 'yearly') return inRange(original) ? [original] : [];

  const out: Date[] = [];
  for (let year = from.getFullYear(); year <= to.getFullYear(); year++) {
    if (year < original.getFullYear()) continue;
    const d = anniversaryInYear(original, year);
    if (inRange(d)) out.push(d);
  }
  return out;
}

export function buildUnifiedAgenda(input: UnifiedAgendaInput): UnifiedAgenda {
  const { userId, from, to } = input;
  const today = startOfLocalDay(input.today ?? from);
  const scope = input.googleScope ?? 'both';
  const hidden = input.hiddenCalendarIds ?? new Set<string>();
  const entries: AgendaEntry[] = [];

  // Díade events (recurring ones expanded by the existing agenda builder).
  for (const item of buildAgenda(input.events, from, to)) {
    entries.push({
      kind: 'event',
      key: `event:${item.key}`,
      day: startOfLocalDay(item.startAt),
      item,
    });
  }

  // Google events.
  const calendars = new Map(input.externalCalendars.map((c) => [c.id, c]));
  const showOthers = input.showOthersDates ?? true;
  const scoped = input.externalEvents.filter((e) => {
    if (e.deletedAt) return false;
    if (hidden.has(e.calendarId)) return false;
    const mine = e.userId === userId;
    return scope === 'both' || (scope === 'me' ? mine : !mine);
  });
  const visibleExternal = dedupeExternalEvents(
    showOthers ? dropGoogleDuplicatesOfDates(scoped, input.importantDates) : scoped,
    userId,
  );
  for (const event of visibleExternal) {
    const calendar = calendars.get(event.calendarId) ?? null;
    const mine = event.userId === userId;
    if (event.isAllDay) {
      const start = event.startDate ? parseDateOnly(event.startDate) : null;
      const end = event.endDate ? parseDateOnly(event.endDate) : start;
      if (!start || !end) continue;
      // One row per day the event covers, clipped to the window.
      const spanDays = Math.min(Math.round((end.getTime() - start.getTime()) / DAY_MS), 366);
      for (let i = 0; i <= spanDays; i++) {
        const day = addLocalDays(start, i);
        if (day.getTime() < from.getTime() || day.getTime() >= to.getTime()) continue;
        entries.push({
          kind: 'external',
          key: `ext:${event.id}:${dayKey(day)}`,
          day,
          event,
          calendar,
          mine,
          isAllDay: true,
          startAt: null,
          endAt: null,
        });
      }
    } else if (event.startAt && event.endAt) {
      const startAt = new Date(event.startAt);
      if (startAt.getTime() < from.getTime() || startAt.getTime() >= to.getTime()) continue;
      entries.push({
        kind: 'external',
        key: `ext:${event.id}`,
        day: startOfLocalDay(startAt),
        event,
        calendar,
        mine,
        isAllDay: false,
        startAt,
        endAt: new Date(event.endAt),
      });
    }
  }

  // Tasks with a due date. Overdue open tasks are pulled out so they cannot slip into the past.
  const overdue: Task[] = [];
  for (const task of input.tasks) {
    if (task.deletedAt || !task.dueDate) continue;
    const day = startOfLocalDay(new Date(task.dueDate));
    if (task.status === 'todo' && day.getTime() < today.getTime()) {
      overdue.push(task);
      continue;
    }
    if (day.getTime() < from.getTime() || day.getTime() >= to.getTime()) continue;
    entries.push({ kind: 'task', key: `task:${task.id}`, day, task });
  }
  overdue.sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  // Important dates.
  for (const item of input.importantDates) {
    if (item.deletedAt) continue;
    if (!showOthers && isThirdPartyDate(item.type)) continue;
    for (const day of importantDateOccurrences(item, from, to)) {
      entries.push({ kind: 'important_date', key: `date:${item.id}:${dayKey(day)}`, day, item });
    }
  }

  // Group by local day.
  entries.sort((a, b) => a.day.getTime() - b.day.getTime() || compareEntries(a, b));
  const days: AgendaDay[] = [];
  for (const entry of entries) {
    const last = days[days.length - 1];
    if (last && isSameLocalDay(last.day, entry.day)) last.entries.push(entry);
    else days.push({ day: entry.day, entries: [entry] });
  }
  return { days, overdue };
}

/**
 * The starred events still ahead, soonest first, for the Today screen. Past events drop off
 * (an all-day event stays through its day), and the choice of calendars on the Calendar
 * screen does not hide a deliberate star, so build the agenda without those filters.
 */
export function pickHighlights(agenda: UnifiedAgenda, now: Date, limit: number = 5): AgendaEntry[] {
  const today = startOfLocalDay(now).getTime();
  const picked: AgendaEntry[] = [];
  for (const group of agenda.days) {
    for (const entry of group.entries) {
      let ahead: boolean;
      if (entry.kind === 'event' && entry.item.highlighted) {
        ahead = entry.item.isAllDay
          ? group.day.getTime() >= today
          : entry.item.endAt.getTime() >= now.getTime();
      } else if (entry.kind === 'external' && entry.event.highlighted) {
        ahead = entry.isAllDay
          ? group.day.getTime() >= today
          : (entry.endAt?.getTime() ?? 0) >= now.getTime();
      } else {
        continue;
      }
      if (ahead) picked.push(entry);
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}
