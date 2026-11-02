import i18next, { type i18n } from 'i18next';
import { en } from './locales/en';
import { ptPT } from './locales/pt-PT';
import { DEFAULT_LANGUAGE, type Language } from './languages';

export const resources = {
  en: { translation: en },
  'pt-PT': { translation: ptPT },
} as const;

/**
 * Creates an i18n instance with both catalogs bundled in, so it is ready synchronously.
 * Apps add their own bindings (e.g. `I18nextProvider` in React).
 */
export function createI18n(language: Language = DEFAULT_LANGUAGE): i18n {
  const instance = i18next.createInstance();
  void instance.init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    // Synchronous: the catalogs are in memory, nothing to fetch.
    initAsync: false,
    // React Native and React already escape output; escaping here would mangle quotes in titles.
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return instance;
}
