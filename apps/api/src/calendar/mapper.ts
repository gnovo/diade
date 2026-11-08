import type {
  ExternalEventStatus,
  ExternalEventTransparency,
  ExternalResponse,
  GoogleAccessRole,
  GoogleEventVisibility,
} from '@diade/domain';
import type { GoogleCalendarListEntry, GoogleEvent } from './google';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCESS_ROLES = ['owner', 'writer', 'reader', 'freeBusyReader'] as const;
const RESPONSES = ['accepted', 'declined', 'tentative', 'needsAction'] as const;
const GOOGLE_VISIBILITIES = ['default', 'public', 'private', 'confidential'] as const;

/** Event types that are not appointments. Working location is noise on a shared agenda. */
const SKIPPED_EVENT_TYPES = new Set(['workingLocation']);

/** Google sends an all-day event's end date exclusive; Díade stores it inclusive. */
export function inclusiveEndDate(startDate: string, exclusiveEndDate: string): string {
  const [y, m, d] = exclusiveEndDate.split('-').map(Number);
  const end = new Date(Date.UTC(y!, m! - 1, d!) - DAY_MS).toISOString().slice(0, 10);
  // A zero-length or inverted range collapses to a single day.
  return end < startDate ? startDate : end;
}

export interface CalendarValues {
  googleCalendarId: string;
  name: string;
  color: string | null;
  timeZone: string | null;
  accessRole: GoogleAccessRole | null;
  /** Google's own "show this calendar" flag, which is what the Android app respects. */
  selected: boolean;
}

export function mapGoogleCalendar(entry: GoogleCalendarListEntry): CalendarValues | null {
  if (entry.deleted) return null;
  const role = ACCESS_ROLES.find((r) => r === entry.accessRole) ?? null;
  return {
    googleCalendarId: entry.id,
    name: (entry.summaryOverride || entry.summary || entry.id).trim(),
    color: entry.backgroundColor ?? null,
    timeZone: entry.timeZone ?? null,
    accessRole: role,
    selected: entry.selected ?? false,
  };
}

export interface EventValues {
  googleEventId: string;
  icalUid: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  startAt: Date | null;
  endAt: Date | null;
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  status: ExternalEventStatus;
  transparency: ExternalEventTransparency;
  myResponse: ExternalResponse | null;
  googleVisibility: GoogleEventVisibility | null;
  htmlLink: string | null;
  isRecurringInstance: boolean;
}

export type MappedEvent =
  | { kind: 'upsert'; values: EventValues }
  | { kind: 'cancelled'; googleEventId: string }
  | { kind: 'skip' };

export function mapGoogleEvent(event: GoogleEvent): MappedEvent {
  if (event.status === 'cancelled') return { kind: 'cancelled', googleEventId: event.id };
  if (event.eventType && SKIPPED_EVENT_TYPES.has(event.eventType)) return { kind: 'skip' };
  if (!event.start || !event.end) return { kind: 'skip' };

  const status: ExternalEventStatus = event.status === 'tentative' ? 'tentative' : 'confirmed';
  const base = {
    googleEventId: event.id,
    icalUid: event.iCalUID ?? null,
    title: event.summary ?? null,
    description: event.description ?? null,
    location: event.location ?? null,
    status,
    transparency: (event.transparency === 'transparent'
      ? 'transparent'
      : 'opaque') as ExternalEventTransparency,
    myResponse: selfResponse(event),
    googleVisibility: (GOOGLE_VISIBILITIES.find((v) => v === event.visibility) ??
      null) as GoogleEventVisibility | null,
    htmlLink: event.htmlLink ?? null,
    isRecurringInstance: Boolean(event.recurringEventId),
  };

  if (event.start.date && DATE_RE.test(event.start.date)) {
    const endExclusive =
      event.end.date && DATE_RE.test(event.end.date) ? event.end.date : event.start.date;
    return {
      kind: 'upsert',
      values: {
        ...base,
        startAt: null,
        endAt: null,
        startDate: event.start.date,
        endDate: inclusiveEndDate(event.start.date, endExclusive),
        isAllDay: true,
      },
    };
  }

  if (event.start.dateTime && event.end.dateTime) {
    const startAt = new Date(event.start.dateTime);
    const endAt = new Date(event.end.dateTime);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return { kind: 'skip' };
    return {
      kind: 'upsert',
      values: { ...base, startAt, endAt, startDate: null, endDate: null, isAllDay: false },
    };
  }

  return { kind: 'skip' };
}

function selfResponse(event: GoogleEvent): ExternalResponse | null {
  const self = event.attendees?.find((a) => a.self);
  return RESPONSES.find((r) => r === self?.responseStatus) ?? null;
}
