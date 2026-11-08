import { useCallback, useEffect, useState } from 'react';
import type { GoogleScope } from '../data/unifiedAgenda';
import { getSyncMeta, setSyncMeta } from '../storage/sqlite';

const SCOPE_KEY = 'calendar_google_scope';
const HIDDEN_KEY = 'calendar_hidden_calendars';
const VIEW_KEY = 'calendar_view';
const OTHERS_KEY = 'calendar_show_others_dates';

export type CalendarView = 'schedule' | 'day' | 'week' | 'month';
export const CALENDAR_VIEWS: readonly CalendarView[] = ['schedule', 'day', 'week', 'month'];

export interface CalendarPrefs {
  googleScope: GoogleScope;
  hiddenCalendarIds: Set<string>;
  view: CalendarView;
  /** Birthdays and anniversaries of other people. On by default. */
  showOthersDates: boolean;
  setShowOthersDates: (show: boolean) => void;
  setView: (view: CalendarView) => void;
  setGoogleScope: (scope: GoogleScope) => void;
  toggleCalendar: (id: string) => void;
}

/**
 * Per-device viewing choices for the Calendar screen: whose Google calendars to show and
 * which individual calendars to hide. Kept in local sync metadata, so they are wiped on
 * sign-out with everything else. They never leave the device.
 */
export function useCalendarPrefs(): CalendarPrefs {
  const [googleScope, setScope] = useState<GoogleScope>('both');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [view, setViewState] = useState<CalendarView>('schedule');
  const [showOthersDates, setShowOthers] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [scope, ids, savedView, others] = await Promise.all([
          getSyncMeta(SCOPE_KEY),
          getSyncMeta(HIDDEN_KEY),
          getSyncMeta(VIEW_KEY),
          getSyncMeta(OTHERS_KEY),
        ]);
        if (cancelled) return;
        if (scope === 'me' || scope === 'partner' || scope === 'both') setScope(scope);
        if (savedView && (CALENDAR_VIEWS as readonly string[]).includes(savedView))
          setViewState(savedView as CalendarView);
        if (others === 'off') setShowOthers(false);
        if (ids) setHidden(new Set(JSON.parse(ids) as string[]));
      } catch {
        // Defaults are fine if the stored value is missing or unreadable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setGoogleScope = useCallback((scope: GoogleScope) => {
    setScope(scope);
    setSyncMeta(SCOPE_KEY, scope).catch(() => undefined);
  }, []);

  const setView = useCallback((next: CalendarView) => {
    setViewState(next);
    setSyncMeta(VIEW_KEY, next).catch(() => undefined);
  }, []);

  const setShowOthersDates = useCallback((show: boolean) => {
    setShowOthers(show);
    setSyncMeta(OTHERS_KEY, show ? 'on' : 'off').catch(() => undefined);
  }, []);

  const toggleCalendar = useCallback((id: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSyncMeta(HIDDEN_KEY, JSON.stringify([...next])).catch(() => undefined);
      return next;
    });
  }, []);

  return {
    googleScope,
    hiddenCalendarIds: hidden,
    view,
    showOthersDates,
    setShowOthersDates,
    setView,
    setGoogleScope,
    toggleCalendar,
  };
}
