import type { Catalog } from './locales/en';

// Makes `t('some.key')` type-checked against the English catalog in every consumer.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Catalog };
    returnNull: false;
  }
}
