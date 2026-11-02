import { describe, it, expect } from 'vitest';
import { resolveLanguage } from './languages';

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
