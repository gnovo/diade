import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { onLocalWrite } from '../data/changes';
import { runSync, subscribeSyncState, getSyncState, type SyncState } from './engine';

interface SyncContextValue extends SyncState {
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

const PUSH_DEBOUNCE_MS = 1_500;
const FOREGROUND_INTERVAL_MS = 30_000;
const OFFLINE_RETRY_MS = [5_000, 15_000, 60_000, 300_000];

/**
 * Drives the sync engine: on sign-in, when the app returns to the foreground, on a
 * steady interval, shortly after local writes, and with backoff while offline.
 */
export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, space } = useAuth();
  const [state, setState] = useState<SyncState>(getSyncState());
  const active = Boolean(user && space);

  const syncNow = useCallback(async () => {
    if (!active) return;
    await runSync();
  }, [active]);

  useEffect(() => subscribeSyncState(setState), []);

  useEffect(() => {
    if (!active) return;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let retryAttempt = 0;
    let disposed = false;

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

    sync();

    const interval = setInterval(sync, FOREGROUND_INTERVAL_MS);
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
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

  const value = useMemo<SyncContextValue>(() => ({ ...state, syncNow }), [state, syncNow]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync must be used within a SyncProvider');
  return context;
}
