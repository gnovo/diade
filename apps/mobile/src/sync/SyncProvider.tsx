import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiClient } from '../api/client';
import { onLocalWrite } from '../data/changes';
import { runSync, subscribeSyncState, getSyncState, type SyncState } from './engine';

interface SyncContextValue extends SyncState {
  syncNow: () => Promise<void>;
  /** A user-initiated sync (pull to refresh). `refreshing` is true while it runs. */
  refresh: () => Promise<void>;
  refreshing: boolean;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

const PUSH_DEBOUNCE_MS = 1_500;
const FOREGROUND_INTERVAL_MS = 30_000;
/** Don't ask the server to refresh Google more often than this; its cron covers the rest. */
const CALENDAR_REFRESH_MIN_MS = 5 * 60_000;
/** A refresh that finishes instantly reads as a glitch, so the spinner stays at least this long. */
const MIN_REFRESH_MS = 700;
/** A pull also asks the server to refresh Google, but not more often than this. */
const MANUAL_CALENDAR_REFRESH_MIN_MS = 30_000;
const OFFLINE_RETRY_MS = [5_000, 15_000, 60_000, 300_000];

/**
 * Drives the sync engine: on sign-in, when the app returns to the foreground, on a
 * steady interval, shortly after local writes, and with backoff while offline.
 */
export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, space } = useAuth();
  const [state, setState] = useState<SyncState>(getSyncState());
  const [refreshing, setRefreshing] = useState(false);
  const lastManualCalendarRefresh = useRef(0);
  const active = Boolean(user && space);

  const syncNow = useCallback(async () => {
    if (!active) return;
    await runSync();
  }, [active]);

  const refresh = useCallback(async () => {
    if (!active) return;
    setRefreshing(true);
    const started = Date.now();
    try {
      const status = await runSync();
      // Google events show on Today, so a pull also asks the server for fresh ones (best effort).
      if (status === 'idle' && Date.now() - lastManualCalendarRefresh.current > MANUAL_CALENDAR_REFRESH_MIN_MS) {
        lastManualCalendarRefresh.current = Date.now();
        try {
          const result = await apiClient.syncCalendars();
          if (result.synced > 0) await runSync();
        } catch {
          // Not connected or offline: the regular sync above already did its job.
        }
      }
    } finally {
      const remaining = MIN_REFRESH_MS - (Date.now() - started);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      setRefreshing(false);
    }
  }, [active]);

  useEffect(() => subscribeSyncState(setState), []);

  useEffect(() => {
    if (!active) return;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let disposed = false;
    let lastCalendarRefresh = 0;

    // Asks the server to pull fresh events from Google, then pulls them down. Best effort:
    // it does nothing when Google Calendar is not connected, and a failure never blocks sync.
    const refreshCalendars = async () => {
      if (Date.now() - lastCalendarRefresh < CALENDAR_REFRESH_MIN_MS) return;
      lastCalendarRefresh = Date.now();
      try {
        const result = await apiClient.syncCalendars();
        if (!disposed && result.synced > 0) await runSync();
      } catch {
        // Offline, signed out, or not connected: the next foreground will try again.
      }
    };

    const sync = async () => {
      if (disposed) return;
      const status = await runSync();
      if (disposed) return;
      if (status === 'offline') {
        const delay = OFFLINE_RETRY_MS[Math.min(retryAttempt, OFFLINE_RETRY_MS.length - 1)];
        retryAttempt += 1;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(sync, delay);
      } else {
        retryAttempt = 0;
      }
    };

    sync().then(refreshCalendars);

    const interval = setInterval(sync, FOREGROUND_INTERVAL_MS);
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync().then(refreshCalendars);
    });
    const unsubscribeWrites = onLocalWrite(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sync, PUSH_DEBOUNCE_MS);
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      clearTimeout(retryTimer);
      clearTimeout(debounceTimer);
      appSub.remove();
      unsubscribeWrites();
    };
  }, [active]);

  const value = useMemo<SyncContextValue>(
    () => ({ ...state, syncNow, refresh, refreshing }),
    [state, syncNow, refresh, refreshing],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
}
