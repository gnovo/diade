import { describe, expect, it } from 'vitest';
import { ALLOWED_EMAILS, isAllowedEmail } from './index';

describe('Díade account allowlist', () => {
  it('allows the two members', () => {
    expect(ALLOWED_EMAILS).toEqual(['gfnovo@gmail.com', 'ana.monica.serrao@gmail.com']);
    expect(isAllowedEmail('gfnovo@gmail.com')).toBe(true);
    expect(isAllowedEmail('ana.monica.serrao@gmail.com')).toBe(true);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isAllowedEmail('  GFNovo@Gmail.com ')).toBe(true);
  });

  it('rejects everyone else and missing emails', () => {
    expect(isAllowedEmail('stranger@gmail.com')).toBe(false);
    expect(isAllowedEmail('gfnovo@gmail.com.evil.test')).toBe(false);
    expect(isAllowedEmail('')).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
  });
});
