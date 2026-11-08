import { describe, it, expect } from 'vitest';
import { trustedOriginsFor, APP_SCHEME, DEV_APP_SCHEME, EXPO_GO_SCHEME } from './index';

describe('trusted sign-in origins', () => {
  it('trusts only the release app in production', () => {
    expect(trustedOriginsFor({ ENVIRONMENT: 'production' })).toEqual([APP_SCHEME]);
  });

  it('also trusts the development build and Expo Go outside production', () => {
    for (const environment of ['development', undefined]) {
      const origins = trustedOriginsFor({ ENVIRONMENT: environment });
      expect(origins).toContain(APP_SCHEME);
      expect(origins).toContain(DEV_APP_SCHEME);
      expect(origins).toContain(EXPO_GO_SCHEME);
    }
  });

  it('keeps the development scheme out of production so a dev build cannot sign in there', () => {
    expect(trustedOriginsFor({ ENVIRONMENT: 'production' })).not.toContain(DEV_APP_SCHEME);
  });
});
