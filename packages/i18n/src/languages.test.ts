import { describe, expect, it } from 'vitest';
import { isLanguagePreference, pickLanguage, resolveLanguage } from './languages';

describe('resolveLanguage', () => {
  it('maps every Portuguese variant to pt-PT', () => {
    expect(resolveLanguage(['pt-PT'])).toBe('pt-PT');
    expect(resolveLanguage(['pt-BR'])).toBe('pt-PT');
    expect(resolveLanguage(['pt'])).toBe('pt-PT');
    expect(resolveLanguage(['pt_AO'])).toBe('pt-PT');
  });

  it('maps English variants to en', () => {
    expect(resolveLanguage(['en-US'])).toBe('en');
    expect(resolveLanguage(['en-GB'])).toBe('en');
  });

  it('uses the first supported language in preference order', () => {
    expect(resolveLanguage(['fr-FR', 'pt-PT', 'en-US'])).toBe('pt-PT');
    expect(resolveLanguage(['de-DE', 'en-US', 'pt-PT'])).toBe('en');
  });

  it('falls back to English when nothing matches or the list is empty', () => {
    expect(resolveLanguage(['fr-FR', 'de-DE'])).toBe('en');
    expect(resolveLanguage([])).toBe('en');
    expect(resolveLanguage([null, undefined, ''])).toBe('en');
  });
});

describe('pickLanguage', () => {
  it('follows the device when the preference is system', () => {
    expect(pickLanguage('system', ['pt-BR'])).toBe('pt-PT');
    expect(pickLanguage('system', ['fr-FR'])).toBe('en');
  });

  it('uses the chosen language regardless of the device', () => {
    expect(pickLanguage('en', ['pt-PT'])).toBe('en');
    expect(pickLanguage('pt-PT', ['en-US'])).toBe('pt-PT');
  });
});

describe('isLanguagePreference', () => {
  it('accepts only known preferences', () => {
    expect(isLanguagePreference('system')).toBe(true);
    expect(isLanguagePreference('pt-PT')).toBe(true);
    expect(isLanguagePreference('fr')).toBe(false);
    expect(isLanguagePreference(null)).toBe(false);
  });
});
