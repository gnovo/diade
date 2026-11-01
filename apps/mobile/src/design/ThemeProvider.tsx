import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from 'react-native-css-interop';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'diade.theme-preference';
const PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
  /** Ready once the saved preference has been read. Render splash until then. */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Single source of truth for light and dark. NativeWind's colour scheme drives the CSS variables
 * (bg-bg, text-ink, ...) and useScheme() drives the JS colours, so both always agree.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        const value = PREFERENCES.find((p) => p === saved) ?? 'system';
        if (!cancelled) {
          setPreferenceState(value);
          setColorScheme(value);
        }
      } catch {
        // Unreadable storage falls back to the system setting.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setColorScheme]);

  const setPreference = useCallback(
    (value: ThemePreference) => {
      setPreferenceState(value);
      setColorScheme(value);
      SecureStore.setItemAsync(STORAGE_KEY, value).catch(() => {
        // Preference still applies for this session if it cannot be saved.
      });
    },
    [setColorScheme],
  );

  const value = useMemo(() => ({ preference, setPreference, ready }), [preference, setPreference, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useThemePreference(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePreference must be used inside ThemeProvider');
  return ctx;
}
