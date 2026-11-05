/**
 * Google Calendar events brought into Díade (read-only). See
 * docs/architecture/calendar-sync-v1.md.
 *
 * The visibility helpers are pure so the API can apply them when it builds a pull
 * response: a partner's device must never receive fields the owner chose not to share.
 */

/** Most to least open. A narrower level can always replace a wider one, never the reverse. */
export const EXTERNAL_VISIBILITIES = ['shared', 'busy_only', 'private'] as const;
export type ExternalVisibility = (typeof EXTERNAL_VISIBILITIES)[number];

/** What an owner may set on a single event. `null` means "inherit from the calendar". */
export type ExternalVisibilityOverride = 'busy_only' | 'private' | null;

export type GoogleAccessRole = 'owner' | 'writer' | 'reader' | 'freeBusyReader';
export type GoogleEventVisibility = 'default' | 'public' | 'private' | 'confidential';
export type ExternalEventStatus = 'confirmed' | 'tentative';
export type ExternalEventTransparency = 'opaque' | 'transparent';
export type ExternalResponse = 'accepted' | 'declined' | 'tentative' | 'needsAction';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
] as const;

const RANK: Record<ExternalVisibility, number> = { shared: 0, busy_only: 1, private: 2 };

/** The narrower (more private) of two visibilities. */
export function narrowestVisibility(...levels: ExternalVisibility[]): ExternalVisibility {
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'shared' as ExternalVisibility);
}

export function isExternalVisibility(value: unknown): value is ExternalVisibility {
  return typeof value === 'string' && (EXTERNAL_VISIBILITIES as readonly string[]).includes(value);
}

/** True when `candidate` is at least as private as `base` (so it is allowed as an override). */
export function isNarrowerOrEqual(candidate: ExternalVisibility, base: ExternalVisibility): boolean {
  return RANK[candidate] >= RANK[base];
}

export interface VisibilityInputs {
  calendarVisibility: ExternalVisibility;
  /** Owner-set override on the event. */
  visibilityOverride: ExternalVisibilityOverride;
  /** Google's own event visibility flag. */
  googleVisibility: GoogleEventVisibility | null;
  /** The owner's RSVP, when they were invited. */
  myResponse: ExternalResponse | null;
  /** Calendars you can only see free/busy for can never be more than `busy_only`. */
  accessRole?: GoogleAccessRole | null;
}

/**
 * The visibility that applies to the partner: the most restrictive of the calendar's level,
 * the event override, Google's own private flag (treated as busy-only) and a declined invite
 * (treated as private).
 */
export function resolveEffectiveVisibility(input: VisibilityInputs): ExternalVisibility {
  const levels: ExternalVisibility[] = [input.calendarVisibility];
  if (input.visibilityOverride) levels.push(input.visibilityOverride);
  if (input.googleVisibility === 'private' || input.googleVisibility === 'confidential') {
    levels.push('busy_only');
  }
  if (input.myResponse === 'declined') levels.push('private');
  if (input.accessRole === 'freeBusyReader') levels.push('busy_only');
  return narrowestVisibility(...levels);
}

/** A synced Google event as stored on the server and mirrored on devices. */
export interface ExternalEvent {
  id: string;
  calendarId: string;
  /** The member whose Google calendar this came from. */
  userId: string;
  googleEventId: string;
  icalUid: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  /** Instants, for timed events. Null for all-day events. */
  startAt: string | null;
  endAt: string | null;
  /** Plain `YYYY-MM-DD`, for all-day events. `endDate` is inclusive. */
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  status: ExternalEventStatus;
  transparency: ExternalEventTransparency;
  myResponse: ExternalResponse | null;
  googleVisibility: GoogleEventVisibility | null;
  visibilityOverride: ExternalVisibilityOverride;
  htmlLink: string | null;
  isRecurringInstance: boolean;
  /** Starred by the owner. The partner sees it only while the event is shared in full. */
  highlighted: boolean;
  /** Only ever set for the owner's own device; the partner never sees the setting. */
  effectiveVisibility: ExternalVisibility;
  /** `true` for a partner device when the event shows as "Busy" only. */
  redacted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** A Google calendar the owner syncs. The partner only receives the safe subset. */
export interface ExternalCalendar {
  id: string;
  userId: string;
  /** Null for a partner's calendar unless it is fully shared. */
  name: string | null;
  color: string | null;
  timeZone: string | null;
  accessRole: GoogleAccessRole | null;
  syncEnabled: boolean;
  visibility: ExternalVisibility;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type StoredExternalEvent = Omit<ExternalEvent, 'effectiveVisibility' | 'redacted'>;

/**
 * Prepares a stored event for one viewer. The owner receives everything. The partner
 * receives the event as the effective visibility allows:
 * - `shared`: everything except the Google link;
 * - `busy_only`: times only, with no title, description or location;
 * - `private`: a tombstone, so a device that held an earlier, wider copy drops it.
 *
 * Free ("transparent") events are never exposed to the partner as busy time, because
 * blocking the partner's view of a free slot would be misleading.
 */
export function redactExternalEvent(
  event: StoredExternalEvent,
  effective: ExternalVisibility,
  viewerIsOwner: boolean,
): ExternalEvent {
  if (viewerIsOwner) return { ...event, effectiveVisibility: effective, redacted: false };

  const gone = effective === 'private' || (effective === 'busy_only' && event.transparency === 'transparent');
  if (gone) {
    return {
      ...event,
      title: null,
      description: null,
      location: null,
      htmlLink: null,
      myResponse: null,
      googleVisibility: null,
      visibilityOverride: null,
      highlighted: false,
      deletedAt: event.deletedAt ?? event.updatedAt,
      effectiveVisibility: effective,
      redacted: true,
    };
  }

  if (effective === 'busy_only') {
    return {
      ...event,
      title: null,
      description: null,
      location: null,
      htmlLink: null,
      icalUid: null,
      myResponse: null,
      googleVisibility: null,
      visibilityOverride: null,
      highlighted: false,
      effectiveVisibility: effective,
      redacted: true,
    };
  }

  return {
    ...event,
    htmlLink: null,
    myResponse: null,
    googleVisibility: null,
    visibilityOverride: null,
    effectiveVisibility: effective,
    redacted: false,
  };
}

/**
 * What the partner may know about a calendar. The name is withheld unless the whole
 * calendar is shared, so a calendar called "Therapy" never leaks through busy blocks.
 */
export function redactExternalCalendar(calendar: ExternalCalendar, viewerIsOwner: boolean): ExternalCalendar {
  if (viewerIsOwner) return calendar;
  const gone = calendar.visibility === 'private' || !calendar.syncEnabled;
  return {
    ...calendar,
    name: calendar.visibility === 'shared' ? calendar.name : null,
    timeZone: null,
    accessRole: null,
    lastSyncedAt: null,
    lastError: null,
    deletedAt: gone ? (calendar.deletedAt ?? calendar.updatedAt) : calendar.deletedAt,
  };
}

/** Display title for an event whose title may be hidden or empty. */
export function externalEventTitle(
  event: Pick<ExternalEvent, 'title' | 'redacted'>,
  labels: { busy: string; untitled: string },
): string {
  if (event.redacted) return labels.busy;
  return event.title?.trim() ? event.title : labels.untitled;
}
