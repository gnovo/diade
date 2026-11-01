import { describe, it, expect } from 'vitest';
import app from './index';
import { createSpacesRouter, generateInviteCode } from './routes/spaces';
import { createSyncRouter } from './routes/sync';

describe('Díade API - Foundation & Health Endpoints', () => {
  it('GET /health returns 200 with ok status and version metadata', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data).toMatchObject({
      status: 'ok',
      version: '0.1.0',
    });
    expect(data.timestamp).toBeDefined();
  });

  it('handles 404 for unknown endpoints with structured JSON', async () => {
    const res = await app.request('/unknown-endpoint');
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });
});

describe('Space & Sync Security Middleware', () => {
  const mockDb = {} as any;
  const mockAuthUnauthorized = {
    api: {
      getSession: async () => null,
    },
  };

  it('rejects unauthenticated requests to spaces router with 401', async () => {
    const spacesRouter = createSpacesRouter(
      () => mockDb,
      () => mockAuthUnauthorized,
    );

    const res = await spacesRouter.request('/current');
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });

  it('rejects unauthenticated requests to sync router with 401', async () => {
    const syncRouter = createSyncRouter(
      () => mockDb,
      () => mockAuthUnauthorized,
    );

    const res = await syncRouter.request('/pull');
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  });
});

describe('Space Invite Code Generation', () => {
  it('generates an 8-character alphanumeric code without confusing characters', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    // Ensure no 0, O, 1, I to prevent human transcription errors
    expect(code).not.toContain('0');
    expect(code).not.toContain('O');
    expect(code).not.toContain('1');
    expect(code).not.toContain('I');
  });

  it('generates unique codes across consecutive calls', () => {
    const code1 = generateInviteCode();
    const code2 = generateInviteCode();
    expect(code1).not.toBe(code2);
  });
});
