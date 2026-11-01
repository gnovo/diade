import { describe, it, expect } from 'vitest';
import { isAllowedEmail, ALLOWED_EMAILS } from './index';

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
