import { describe, expect, it } from 'vitest';
import { inviteState } from './invite';

const now = new Date('2026-11-06T12:00:00Z');
const later = '2026-11-13T12:00:00Z';
const earlier = '2026-11-05T12:00:00Z';

describe('inviteState', () => {
  it('is none without a space', () => {
    expect(inviteState(null, 1, now)).toEqual({ kind: 'none' });
  });

  it('is none once the partner has joined', () => {
    expect(inviteState({ inviteCode: 'ABC', inviteExpiresAt: later }, 2, now)).toEqual({
      kind: 'none',
    });
  });

  it('is valid with a code that has not expired', () => {
    expect(inviteState({ inviteCode: 'ABC', inviteExpiresAt: later }, 1, now)).toEqual({
      kind: 'valid',
      code: 'ABC',
      expiresAt: new Date(later),
    });
  });

  it('is valid with a code that never expires', () => {
    expect(inviteState({ inviteCode: 'ABC', inviteExpiresAt: null }, 1, now)).toEqual({
      kind: 'valid',
      code: 'ABC',
      expiresAt: null,
    });
  });

  it('is expired past its expiry or without a code', () => {
    expect(inviteState({ inviteCode: 'ABC', inviteExpiresAt: earlier }, 1, now)).toEqual({
      kind: 'expired',
    });
    expect(inviteState({ inviteCode: '', inviteExpiresAt: later }, 1, now)).toEqual({
      kind: 'expired',
    });
  });
});
