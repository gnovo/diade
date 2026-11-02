import 'intl-pluralrules';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { createI18n, resolveLanguage, type Language } from '@diade/i18n';

/** The app language follows the device: the first supported language in the user's preference list. */
const detectLanguage = (): Language => resolveLanguage(getLocales().map((locale) => locale.languageTag));

export const i18n = createI18n(detectLanguage());

/** Provides translations to the tree and re-checks the device language whenever the app returns to the foreground. */
export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const next = detectLanguage();
      if (next !== i18n.language) void i18n.changeLanguage(next);
    });
    return () => subscription.remove();
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
};

export { useTranslation };
