/**
 * What Today shows about the partner's day: the open tasks assigned to them alone, and their
 * Google events for today and tomorrow. Pure, so the privacy rules are unit tested.
 *
 * It only ever shows what the viewer is already allowed to see:
 * - Tasks must pass `canAccessRecord`, so the partner's personal tasks stay hidden.
 * - Google events are already redacted per the partner's sharing choice (`redacted` events keep
 *   no title), and a partner's hidden calendars never reach this device.
 * Tasks shared by both ("both" assignee) and Díade events are left out: they are not theirs alone
 * and already appear on the viewer's own Today.
 */
import {
  addLocalDays,
  canAccessRecord,
  type ExternalCalendar,
  type ExternalEvent,
  startOfLocalDay,
  type Task,
} from '@diade/domain';
import { type AgendaEntry, buildUnifiedAgenda } from './unifiedAgenda';

type PartnerEventEntry = Extract<AgendaEntry, { kind: 'external' }>;

export interface PartnerDay {
  /** Their open tasks: overdue first, then by due date, undated last. */
  tasks: Task[];
  /** Their Google events still to come today and tomorrow. */
  events: PartnerEventEntry[];
  /** How many of `events` fall today. */
  eventsToday: number;
}

export interface PartnerDayInput {
  tasks: Task[];
  externalEvents: ExternalEvent[];
  externalCalendars: ExternalCalendar[];
  userId: string;
  partnerId: string;
  now: Date;
}

export function partnerDay({
  tasks,
  externalEvents,
  externalCalendars,
  userId,
  partnerId,
  now,
}: PartnerDayInput): PartnerDay {
  const dayStart = startOfLocalDay(now);
  const tomorrowStart = addLocalDays(dayStart, 1);

  const due = (task: Task) => (task.dueDate ? new Date(task.dueDate).getTime() : Infinity);
  const mine = tasks
    .filter(
      (t) =>
        !t.deletedAt &&
        t.status === 'todo' &&
        t.assigneeId === partnerId &&
        canAccessRecord(t, userId),
    )
    .sort((a, b) => due(a) - due(b) || a.title.localeCompare(b.title));

  const events = buildUnifiedAgenda({
    events: [],
    externalEvents,
    externalCalendars,
    tasks: [],
    importantDates: [],
    userId,
    from: dayStart,
    to: addLocalDays(dayStart, 2),
    googleScope: 'partner',
  })
    .days.flatMap((d) => d.entries)
    .filter((entry): entry is PartnerEventEntry => {
      if (entry.kind !== 'external') return false;
      // Skip what has already finished today. All-day items stay for the whole day.
      return entry.isAllDay || entry.endAt!.getTime() >= now.getTime();
    });

  return {
    tasks: mine,
    events,
    eventsToday: events.filter((e) => e.day.getTime() < tomorrowStart.getTime()).length,
  };
}
