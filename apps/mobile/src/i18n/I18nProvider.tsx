import 'intl-pluralrules';
import {
  createI18n,
  isLanguagePreference,
  type LanguagePreference,
  pickLanguage,
} from '@diade/i18n';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

const STORAGE_KEY = 'diade.language-preference';

const deviceTags = () => getLocales().map((locale) => locale.languageTag);

export const i18n = createI18n(pickLanguage('system', deviceTags()));

/** Switches the app to the language a preference resolves to. */
const applyPreference = (preference: LanguagePreference) => {
  const next = pickLanguage(preference, deviceTags());
  if (next !== i18n.language) void i18n.changeLanguage(next);
};

interface LanguageContextValue {
  preference: LanguagePreference;
  setPreference: (value: LanguagePreference) => void;
  /** Ready once the saved preference has been read, so the first frame is in the right language. */
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Provides translations to the tree. The language is the member's saved choice, or the device
 * language ("system"), which is re-checked whenever the app returns to the foreground.
 */
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!cancelled && isLanguagePreference(saved)) {
          setPreferenceState(saved);
          applyPreference(saved);
        }
      } catch {
        // Unreadable storage falls back to the device language.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') applyPreference('system');
    });
    return () => subscription.remove();
  }, [preference]);

  const setPreference = useCallback((value: LanguagePreference) => {
    setPreferenceState(value);
    applyPreference(value);
    SecureStore.setItemAsync(STORAGE_KEY, value).catch(() => {
      // The choice still applies for this session if it cannot be saved.
    });
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference, ready }),
    [preference, setPreference, ready],
  );
  return (
    <LanguageContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
};

export function useLanguagePreference(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguagePreference must be used inside I18nProvider');
  return ctx;
}

export { useTranslation };
