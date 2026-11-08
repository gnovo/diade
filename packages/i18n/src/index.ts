import './types';

export type { i18n as I18n, TFunction } from 'i18next';
export {
  formatCompactRange,
  formatDateRange,
  formatDayLabel,
  formatLongDate,
  formatMonthYear,
} from './format';
export { createI18n, resources } from './i18n';
export {
  DEFAULT_LANGUAGE,
  isLanguagePreference,
  LANGUAGE_PREFERENCES,
  type Language,
  type LanguagePreference,
  pickLanguage,
  resolveLanguage,
  SUPPORTED_LANGUAGES,
} from './languages';
export { type Catalog, en } from './locales/en';
export { ptPT } from './locales/pt-PT';
