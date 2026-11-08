import { describe, expect, it } from 'vitest';
import { createI18n } from './i18n';
import { en } from './locales/en';
import { ptPT } from './locales/pt-PT';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  const english = flatten(en);
  const portuguese = flatten(ptPT);

  it('have the same keys', () => {
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort());
  });

  it('use the same {{placeholders}} in every translation', () => {
    for (const [key, text] of Object.entries(english)) {
      expect(placeholders(portuguese[key]), key).toEqual(placeholders(text));
    }
  });

  it('have no empty strings', () => {
    for (const [key, text] of [...Object.entries(english), ...Object.entries(portuguese)]) {
      expect(text.trim(), key).not.toBe('');
    }
  });
});

describe('createI18n', () => {
  it('translates and switches language', async () => {
    const i18n = createI18n('en');
    expect(i18n.t('auth.tagline')).toBe('For all the days we share.');
    await i18n.changeLanguage('pt-PT');
    expect(i18n.t('auth.tagline')).toBe('Para todos os dias que partilhamos.');
  });

  it('uses the new tagline copy on the sign-in screen', () => {
    expect(createI18n('en').t('auth.justForTwo')).toBe('Just for the two of you.');
    expect(createI18n('pt-PT').t('auth.justForTwo')).toBe('Apenas para vocês os dois.');
  });

  it('pluralises per language (pt-PT treats 0 as plural)', () => {
    const pt = createI18n('pt-PT');
    expect(pt.t('common.day', { count: 0 })).toBe('0 dias');
    expect(pt.t('common.day', { count: 1 })).toBe('1 dia');
    expect(pt.t('common.day', { count: 2 })).toBe('2 dias');
    const en = createI18n('en');
    expect(en.t('common.day', { count: 0 })).toBe('0 days');
    expect(en.t('common.day', { count: 1 })).toBe('1 day');
  });

  it('does not escape user text such as quotes', () => {
    expect(createI18n('en').t('household.deleteBody', { title: `Ana's "plan" <3` })).toBe(
      `"Ana's "plan" <3" will be removed.`,
    );
  });
});
