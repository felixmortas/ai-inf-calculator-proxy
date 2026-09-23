import { describe, expect, it, vi } from 'vitest';
import { rateLimit } from '../src/rate-limit';
import type { Env } from '../src/types';

function setup(success = true) {
  const limit = vi.fn().mockResolvedValue({ success });
  const env = { RATE_LIMITER: { limit } } as unknown as Env;
  const request = new Request('https://worker.example/v1/import-html', { headers: { 'CF-Connecting-IP': '192.0.2.1' } });
  return { limit, env, request };
}

describe('native rate limit', () => {
  it('keys the binding by visitor IP', async () => {
    const { limit, env, request } = setup();
    await rateLimit(request, env);
    expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
  });
  it('returns a typed failure on exhaustion', async () => {
    const { env, request } = setup(false);
    await expect(rateLimit(request, env)).rejects.toMatchObject({ code: 'rate-limit', status: 429 });
  });
  it('fails closed without an IP or working binding', async () => {
    const { env, request, limit } = setup();
    await expect(rateLimit(new Request(request.url), env)).rejects.toMatchObject({ code: 'rate-limit' });
    limit.mockRejectedValueOnce(new Error('binding failed'));
    await expect(rateLimit(request, env)).rejects.toMatchObject({ code: 'configuration' });
  });
  it('uses a shared fallback key only in the local development environment', async () => {
    const { env, request, limit } = setup();
    const noIp = new Request(request.url);
    env.ALLOWED_ORIGIN = 'http://localhost:5173';
    await rateLimit(noIp, env);
    expect(limit).toHaveBeenCalledWith({ key: 'local-development' });
    limit.mockClear();
    await rateLimit(request, env);
    expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' });
    env.ALLOWED_ORIGIN = 'https://felixmortas.com';
    await expect(rateLimit(noIp, env)).rejects.toMatchObject({ code: 'rate-limit' });
  });
});
