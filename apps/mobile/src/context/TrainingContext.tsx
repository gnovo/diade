import type { TrainingSettings } from '@diade/domain';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { getSyncMeta, setSyncMeta } from '../storage/sqlite';
import { useAuth } from './AuthContext';

/** The last settings the server confirmed, so the Today card and the block sheet work offline. */
const CACHE_KEY = 'training_settings';

interface TrainingContextType {
  /** Null until the member sets up their training week. */
  training: TrainingSettings | null;
  /** Saves on the server, then here. Needs a connection; throws when it fails. */
  save: (training: TrainingSettings | null) => Promise<void>;
}

const TrainingContext = createContext<TrainingContextType | undefined>(undefined);

function parseCached(raw: string | null): TrainingSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { training: TrainingSettings | null };
    return value.training ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed-in member's work-cycle anchor and weekly goals. On the server per member, never shown to the partner,
 * and cached in the local sync metadata (wiped on sign-out), like the nutrition settings.
 */
export const TrainingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, space } = useAuth();
  const [training, setTraining] = useState<TrainingSettings | null>(null);

  useEffect(() => {
    if (!user || !space) {
      setTraining(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const cached = parseCached(await getSyncMeta(CACHE_KEY).catch(() => null));
      if (cached && !cancelled) setTraining(cached);
      try {
        const fresh = await apiClient.getTrainingSettings();
        if (cancelled) return;
        setTraining(fresh.training);
        await setSyncMeta(CACHE_KEY, JSON.stringify(fresh));
      } catch {
        // Offline or the server is unreachable: the cached settings stand.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, space]);

  const save = useCallback(async (next: TrainingSettings | null) => {
    const saved = await apiClient.updateTrainingSettings(next);
    setTraining(saved.training);
    await setSyncMeta(CACHE_KEY, JSON.stringify(saved));
  }, []);

  const value = useMemo(() => ({ training, save }), [training, save]);
  return <TrainingContext.Provider value={value}>{children}</TrainingContext.Provider>;
};

export function useTraining(): TrainingContextType {
  const context = useContext(TrainingContext);
  if (!context) throw new Error('useTraining must be used inside TrainingProvider');
  return context;
}
