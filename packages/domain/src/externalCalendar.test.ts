import { describe, expect, it } from 'vitest';
import {
  type ExternalCalendar,
  externalEventTitle,
  isNarrowerOrEqual,
  narrowestVisibility,
  redactExternalCalendar,
  redactExternalEvent,
  resolveEffectiveVisibility,
  type StoredExternalEvent,
} from './externalCalendar';

const event = (over: Partial<StoredExternalEvent> = {}): StoredExternalEvent => ({
  id: 'e1',
  calendarId: 'c1',
  userId: 'owner',
  googleEventId: 'g1',
  icalUid: 'uid@google.com',
  title: 'Dentist',
  description: 'Bring forms',
  location: 'Rua X',
  startAt: '2026-11-10T09:00:00.000Z',
  endAt: '2026-11-10T10:00:00.000Z',
  startDate: null,
  endDate: null,
  isAllDay: false,
  status: 'confirmed',
  transparency: 'opaque',
  myResponse: 'accepted',
  googleVisibility: 'default',
  visibilityOverride: null,
  htmlLink: 'https://calendar.google.com/event?eid=1',
  isRecurringInstance: false,
  highlighted: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const calendar = (over: Partial<ExternalCalendar> = {}): ExternalCalendar => ({
  id: 'c1',
  userId: 'owner',
  name: 'Work',
  color: '#336699',
  timeZone: 'Europe/Lisbon',
  accessRole: 'owner',
  syncEnabled: true,
  visibility: 'shared',
  lastSyncedAt: '2026-11-02T00:00:00.000Z',
  lastError: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

describe('visibility ordering', () => {
  it('picks the most private level', () => {
    expect(narrowestVisibility('shared', 'busy_only')).toBe('busy_only');
    expect(narrowestVisibility('busy_only', 'private', 'shared')).toBe('private');
    expect(narrowestVisibility('shared')).toBe('shared');
  });

  it('only allows an override that narrows the calendar level', () => {
    expect(isNarrowerOrEqual('private', 'shared')).toBe(true);
    expect(isNarrowerOrEqual('busy_only', 'busy_only')).toBe(true);
    expect(isNarrowerOrEqual('shared', 'busy_only')).toBe(false);
  });
});

describe('resolveEffectiveVisibility', () => {
  const base = {
    calendarVisibility: 'shared' as const,
    visibilityOverride: null,
    googleVisibility: 'default' as const,
    myResponse: 'accepted' as const,
  };

  it('uses the calendar level when nothing narrows it', () => {
    expect(resolveEffectiveVisibility(base)).toBe('shared');
    expect(resolveEffectiveVisibility({ ...base, calendarVisibility: 'busy_only' })).toBe(
      'busy_only',
    );
  });

  it('lets an event override narrow but never widen', () => {
    expect(resolveEffectiveVisibility({ ...base, visibilityOverride: 'private' })).toBe('private');
    expect(
      resolveEffectiveVisibility({
        ...base,
        calendarVisibility: 'private',
        visibilityOverride: 'busy_only',
      }),
    ).toBe('private');
  });

  it("treats Google's private and confidential events as busy-only", () => {
    expect(resolveEffectiveVisibility({ ...base, googleVisibility: 'private' })).toBe('busy_only');
    expect(resolveEffectiveVisibility({ ...base, googleVisibility: 'confidential' })).toBe(
      'busy_only',
    );
  });

  it('treats a declined invite as private', () => {
    expect(resolveEffectiveVisibility({ ...base, myResponse: 'declined' })).toBe('private');
  });

  it('limits free/busy-only calendars to busy-only', () => {
    expect(resolveEffectiveVisibility({ ...base, accessRole: 'freeBusyReader' })).toBe('busy_only');
  });
});

describe('redactExternalEvent', () => {
  describe('highlight', () => {
    const starred = event({ highlighted: true });
    it('stays on for the owner, whatever the visibility', () => {
      for (const effective of ['shared', 'busy_only', 'private'] as const) {
        expect(redactExternalEvent(starred, effective, true).highlighted).toBe(true);
      }
    });
    it('reaches the partner only while the event is shared in full', () => {
      expect(redactExternalEvent(starred, 'shared', false).highlighted).toBe(true);
      expect(redactExternalEvent(starred, 'busy_only', false).highlighted).toBe(false);
      expect(redactExternalEvent(starred, 'private', false).highlighted).toBe(false);
    });
    it('is dropped from a free slot that is hidden from the partner', () => {
      const free = event({ highlighted: true, transparency: 'transparent' });
      expect(redactExternalEvent(free, 'busy_only', false).highlighted).toBe(false);
    });
  });

  it('gives the owner everything', () => {
    const out = redactExternalEvent(event(), 'private', true);
    expect(out.title).toBe('Dentist');
    expect(out.htmlLink).toBeTruthy();
    expect(out.redacted).toBe(false);
    expect(out.deletedAt).toBeNull();
  });

  it('shares full detail with the partner, except the Google link and owner-only fields', () => {
    const out = redactExternalEvent(event(), 'shared', false);
    expect(out.title).toBe('Dentist');
    expect(out.location).toBe('Rua X');
    expect(out.htmlLink).toBeNull();
    expect(out.myResponse).toBeNull();
    expect(out.googleVisibility).toBeNull();
    expect(out.redacted).toBe(false);
  });

  it('hides every detail of a busy-only event but keeps the time', () => {
    const out = redactExternalEvent(event(), 'busy_only', false);
    expect(out.title).toBeNull();
    expect(out.description).toBeNull();
    expect(out.location).toBeNull();
    expect(out.htmlLink).toBeNull();
    expect(out.icalUid).toBeNull();
    expect(out.startAt).toBe('2026-11-10T09:00:00.000Z');
    expect(out.redacted).toBe(true);
    expect(out.deletedAt).toBeNull();
  });

  it('turns a private event into a content-free tombstone for the partner', () => {
    const out = redactExternalEvent(event(), 'private', false);
    expect(out.deletedAt).toBe('2026-11-02T00:00:00.000Z');
    expect(out.title).toBeNull();
    expect(out.description).toBeNull();
    expect(out.location).toBeNull();
  });

  it('never exposes a free (transparent) event as a busy block', () => {
    const out = redactExternalEvent(event({ transparency: 'transparent' }), 'busy_only', false);
    expect(out.deletedAt).not.toBeNull();
    expect(out.title).toBeNull();
  });

  it('keeps an existing tombstone date', () => {
    const out = redactExternalEvent(
      event({ deletedAt: '2026-11-05T00:00:00.000Z' }),
      'private',
      false,
    );
    expect(out.deletedAt).toBe('2026-11-05T00:00:00.000Z');
  });
});

describe('redactExternalCalendar', () => {
  it('shows the owner everything', () => {
    expect(redactExternalCalendar(calendar({ visibility: 'private' }), true).name).toBe('Work');
  });

  it("shows the partner a fully shared calendar's name but not sync details", () => {
    const out = redactExternalCalendar(calendar(), false);
    expect(out.name).toBe('Work');
    expect(out.timeZone).toBeNull();
    expect(out.lastError).toBeNull();
    expect(out.deletedAt).toBeNull();
  });

  it('withholds the name of a busy-only calendar', () => {
    expect(redactExternalCalendar(calendar({ visibility: 'busy_only' }), false).name).toBeNull();
  });

  it('removes a private or disabled calendar from the partner', () => {
    expect(
      redactExternalCalendar(calendar({ visibility: 'private' }), false).deletedAt,
    ).not.toBeNull();
    expect(
      redactExternalCalendar(calendar({ syncEnabled: false }), false).deletedAt,
    ).not.toBeNull();
  });
});

describe('externalEventTitle', () => {
  const labels = { busy: 'Busy', untitled: '(No title)' };
  it('labels redacted events as busy', () => {
    expect(externalEventTitle({ title: null, redacted: true }, labels)).toBe('Busy');
  });
  it('falls back for empty titles', () => {
    expect(externalEventTitle({ title: '  ', redacted: false }, labels)).toBe('(No title)');
    expect(externalEventTitle({ title: null, redacted: false }, labels)).toBe('(No title)');
  });
  it('returns the title otherwise', () => {
    expect(externalEventTitle({ title: 'Lunch', redacted: false }, labels)).toBe('Lunch');
  });
});
