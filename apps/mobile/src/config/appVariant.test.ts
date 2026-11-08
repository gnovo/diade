import type { ExpoConfig } from 'expo/config';
import { describe, expect, it } from 'vitest';
import { applyVariant, DEV_APP_ID, resolveVariant } from '../../app.config';
import appJson from '../../app.json';

const base = appJson.expo as unknown as ExpoConfig;

describe('resolveVariant', () => {
  it('treats unset, empty and "production" as production', () => {
    expect(resolveVariant(undefined)).toBe('production');
    expect(resolveVariant('')).toBe('production');
    expect(resolveVariant('production')).toBe('production');
  });

  it('accepts dev', () => {
    expect(resolveVariant('dev')).toBe('dev');
  });

  it('rejects anything else instead of guessing', () => {
    for (const typo of ['development', 'Dev', 'staging', 'prod']) {
      expect(() => resolveVariant(typo)).toThrow(/Unknown APP_VARIANT/);
    }
  });
});

describe('applyVariant', () => {
  it('returns the production config untouched, so the native fingerprint cannot change', () => {
    expect(applyVariant(base, 'production')).toBe(base);
  });

  it('gives the dev app its own identity, beside the release app', () => {
    const dev = applyVariant(base, 'dev');
    expect(dev.android?.package).toBe(DEV_APP_ID);
    expect(dev.ios?.bundleIdentifier).toBe(DEV_APP_ID);
    expect(dev.android?.package).not.toBe(base.android?.package);
    expect(dev.scheme).toBe('diade-dev');
    expect(dev.name).toBe('Díade Dev');
  });

  it('keeps the EAS project and never takes production updates', () => {
    const dev = applyVariant(base, 'dev');
    expect(dev.extra?.eas).toEqual(base.extra?.eas);
    expect(dev.updates).toEqual({ enabled: false });
    expect(dev.updates?.url).toBeUndefined();
  });

  it('does not mutate the base config', () => {
    const before = JSON.stringify(base);
    applyVariant(base, 'dev');
    expect(JSON.stringify(base)).toBe(before);
  });
});
