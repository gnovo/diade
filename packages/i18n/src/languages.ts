export const SUPPORTED_LANGUAGES = ['en', 'pt-PT'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/**
 * Picks the app language from the device's locale tags, most preferred first (BCP 47, e.g.
 * `pt-BR`, `en-GB`). The first tag we have a catalog for wins. Every Portuguese variant maps to
 * `pt-PT`, the only Portuguese catalog. Anything else falls back to English.
 */
export function resolveLanguage(tags: ReadonlyArray<string | null | undefined>): Language {
  for (const tag of tags) {
    const primary = tag?.split(/[-_]/)[0]?.toLowerCase();
    if (primary === 'pt') return 'pt-PT';
    if (primary === 'en') return 'en';
  }
  return DEFAULT_LANGUAGE;
}
