import './types';

export { en, type Catalog } from './locales/en';
export { ptPT } from './locales/pt-PT';
export { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, resolveLanguage, type Language } from './languages';
export { createI18n, resources } from './i18n';
export { formatDayLabel, formatLongDate } from './format';
export type { TFunction, i18n as I18n } from 'i18next';
