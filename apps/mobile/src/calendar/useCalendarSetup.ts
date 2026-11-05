import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

/**
 * Whether the member still has to confirm the calendar picker. The local mirror does not carry
 * that flag, so it is asked of the server. While the answer is unknown, or when the server cannot
 * be reached, this reports `false`: a prompt is only shown on a definite "not confirmed yet".
 *
 * `refreshKey` re-asks, e.g. after the settings screen closes or the calendars change.
 */
export function useNeedsCalendarSetup(hasCalendars: boolean, refreshKey: unknown): boolean {
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (!hasCalendars) {
      setNeedsSetup(false);
      return;
    }
    let cancelled = false;
    apiClient
      .getCalendarConnection()
      .then((connection) => {
        if (!cancelled) setNeedsSetup(connection.connected && !connection.confirmed);
      })
      .catch(() => {
        /* offline or signed out: keep the last answer */
      });
    return () => {
      cancelled = true;
    };
  }, [hasCalendars, refreshKey]);

  return needsSetup;
}
