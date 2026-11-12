import type { NutritionSettings, UpdateNutritionSettingsRequest } from '@diade/contracts';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { getSyncMeta, setSyncMeta } from '../storage/sqlite';
import { useAuth } from './AuthContext';

/** The last settings the server confirmed, so the plan summary and the Today card work offline too. */
const CACHE_KEY = 'nutrition_settings';
const OFF: NutritionSettings = { enabled: false, targets: null };

interface NutritionContextType {
  settings: NutritionSettings;
  /** Whether the targets show: the member turned them on and has set them. */
  active: boolean;
  /** Saves on the server, then here. Needs a connection; throws when it fails. */
  update: (changes: UpdateNutritionSettingsRequest) => Promise<void>;
}

const NutritionContext = createContext<NutritionContextType | undefined>(undefined);

function parseCached(raw: string | null): NutritionSettings | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as NutritionSettings;
    return typeof value.enabled === 'boolean' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in member's own nutrition settings. They live on the server (per member, never shown to the partner)
 * and are cached in the local sync metadata, which sign-out wipes with everything else.
 */
export const NutritionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, space } = useAuth();
  const [settings, setSettings] = useState<NutritionSettings>(OFF);

  useEffect(() => {
    if (!user || !space) {
      setSettings(OFF);
      return;
    }
    let cancelled = false;
    (async () => {
      const cached = parseCached(await getSyncMeta(CACHE_KEY).catch(() => null));
      if (cached && !cancelled) setSettings(cached);
      try {
        const fresh = await apiClient.getNutritionSettings();
        if (cancelled) return;
        setSettings(fresh);
        await setSyncMeta(CACHE_KEY, JSON.stringify(fresh));
      } catch {
        // Offline or the server is unreachable: the cached settings stand.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, space]);

  const update = useCallback(async (changes: UpdateNutritionSettingsRequest) => {
    const saved = await apiClient.updateNutritionSettings(changes);
    setSettings(saved);
    await setSyncMeta(CACHE_KEY, JSON.stringify(saved));
  }, []);

  const value = useMemo(
    () => ({ settings, active: settings.enabled && settings.targets !== null, update }),
    [settings, update],
  );
  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
};

export function useNutrition(): NutritionContextType {
  const context = useContext(NutritionContext);
  if (!context) throw new Error('useNutrition must be used inside NutritionProvider');
  return context;
}
