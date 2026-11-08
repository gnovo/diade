import { describe, expect, it, vi } from 'vitest';
import {
  createGoogleClient,
  GoogleApiError,
  GoogleAuthError,
  refreshGoogleAccessToken,
} from './google';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createGoogleClient', () => {
  it('pages through the calendar list', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ items: [{ id: 'a' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json({ items: [{ id: 'b' }] }));
    const client = createGoogleClient(async () => 'tok', fetchFn);

    expect((await client.listCalendars()).map((c) => c.id)).toEqual(['a', 'b']);
    expect(String(fetchFn.mock.calls[1]![0])).toContain('pageToken=p2');
  });

  it('sends the window for a full sync and omits it when a sync token is used', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({ items: [] }));
    const client = createGoogleClient(async () => 'tok', fetchFn);

    await client.listEvents('me@x.com', {
      timeMin: new Date('2026-10-01T00:00:00Z'),
      timeMax: new Date('2027-10-01T00:00:00Z'),
    });
    const full = new URL(String(fetchFn.mock.calls[0]![0]));
    expect(full.pathname).toBe('/calendar/v3/calendars/me%40x.com/events');
    expect(full.searchParams.get('timeMin')).toBe('2026-10-01T00:00:00.000Z');
    expect(full.searchParams.get('singleEvents')).toBe('true');
    expect(full.searchParams.get('showDeleted')).toBe('true');

    await client.listEvents('me@x.com', { syncToken: 'S1' });
    const incremental = new URL(String(fetchFn.mock.calls[1]![0]));
    expect(incremental.searchParams.get('syncToken')).toBe('S1');
    expect(incremental.searchParams.has('timeMin')).toBe(false);
    expect(incremental.searchParams.has('timeMax')).toBe(false);
  });

  it('refreshes the token once on a 401 and retries', async () => {
    const getToken = vi.fn(async (force?: boolean) => (force ? 'fresh' : 'stale'));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { message: 'expired' } }, 401))
      .mockResolvedValueOnce(json({ items: [] }));
    const client = createGoogleClient(getToken, fetchFn);

    await client.listEvents('c', {});
    expect(getToken).toHaveBeenNthCalledWith(2, true);
    expect((fetchFn.mock.calls[1]![1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer fresh',
    });
  });

  it('gives up with an auth error when the refreshed token is also rejected', async () => {
    const fetchFn = vi.fn().mockImplementation(async () => json({}, 401));
    const client = createGoogleClient(async () => 't', fetchFn);
    await expect(client.listEvents('c', {})).rejects.toBeInstanceOf(GoogleAuthError);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('flags 410 Gone and rate limiting', async () => {
    const gone = createGoogleClient(
      async () => 't',
      async () => json({ error: { message: 'Gone' } }, 410),
    );
    await expect(gone.listEvents('c', { syncToken: 'x' })).rejects.toMatchObject({ isGone: true });

    const limited = createGoogleClient(
      async () => 't',
      async () =>
        json({ error: { message: 'slow down', errors: [{ reason: 'rateLimitExceeded' }] } }, 403),
    );
    const err = await limited.listEvents('c', {}).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect(err.isRateLimited).toBe(true);
  });
});

describe('refreshGoogleAccessToken', () => {
  const creds = { clientId: 'id', clientSecret: 'secret', refreshToken: 'r' };

  it('returns the new access token and expiry', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ access_token: 'new', expires_in: 3599 }));
    const result = await refreshGoogleAccessToken(creds, fetchFn);
    expect(result).toEqual({ accessToken: 'new', expiresIn: 3599, refreshToken: undefined });
    const body = new URLSearchParams(String((fetchFn.mock.calls[0]![1] as RequestInit).body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('r');
  });

  it('reports a revoked grant as an auth error so the member is asked to reconnect', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400));
    await expect(refreshGoogleAccessToken(creds, fetchFn)).rejects.toBeInstanceOf(GoogleAuthError);
  });

  it('treats other failures as retryable API errors', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: 'temporarily_unavailable' }, 503));
    await expect(refreshGoogleAccessToken(creds, fetchFn)).rejects.toBeInstanceOf(GoogleApiError);
  });
});
