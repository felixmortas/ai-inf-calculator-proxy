import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const limit = vi.fn().mockResolvedValue({ success: true });
const env = { ALLOWED_ORIGIN: 'https://felixmortas.com', ALLOWED_LOCAL_ORIGIN: 'http://localhost:5173', RATE_LIMITER: { limit } } as any;
const validUrl = 'https://claude.ai/share/123e4567-e89b-42d3-a456-426614174000';
function post(origin = env.ALLOWED_ORIGIN, body: unknown = { shareUrl: validUrl }, path = '/v1/import-html') {
  return new Request(`https://worker.example${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body) });
}

describe('route security', () => {
  it.each([undefined, 'https://other.example', 'http://127.0.0.1:5173', 'http://localhost:5174'])('rejects foreign or missing origin %s before upstream work', async origin => {
    const request = post(origin ?? 'https://other.example');
    if (origin === undefined) request.headers.delete('Origin');
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await expect(response.json()).resolves.toEqual({ ok: false, error: { code: 'origin' } });
  });
  it('accepts no methods other than POST', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/import-html', { headers: { Origin: env.ALLOWED_ORIGIN } }), env);
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ ok: false, error: { code: 'method' } });
  });
  it('serves only same-origin CORS preflight', async () => {
    const request = new Request('https://worker.example/v1/import-html', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } });
    const response = await worker.fetch(request, env);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });
  it('accepts localhost on the deployed Worker and exposes typed errors', async () => {
    const origin = 'http://localhost:5173';
    const preflight = await worker.fetch(new Request('https://worker.example/v1/import-html', {
      method: 'OPTIONS',
      headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Content-Type');

    const response = await worker.fetch(post(origin, { shareUrl: 'https://evil.example/' }), env);
    expect(response.status).toBe(400);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    await expect(response.json()).resolves.toEqual({ ok: false, error: { code: 'policy' } });
  });
  it('does not grant CORS preflight to a different localhost port', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/import-html', {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:5174', 'Access-Control-Request-Method': 'POST' },
    }), env);
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    await expect(response.json()).resolves.toEqual({ ok: false, error: { code: 'origin' } });
  });
  it.each([
    [post(env.ALLOWED_ORIGIN, { url: validUrl }), 'policy', 1],
    [post(env.ALLOWED_ORIGIN, { shareUrl: validUrl }, '/wrong'), 'policy', 0],
    [post(env.ALLOWED_ORIGIN, { shareUrl: validUrl }, '/v1/import-html?x=1'), 'policy', 0],
  ])('rejects wrong body and route without upstream request', async (request, code, count) => {
    limit.mockClear();
    const response = await worker.fetch(request, env);
    expect((await response.json() as any).error.code).toBe(code);
    expect(limit).toHaveBeenCalledTimes(count);
  });
  it('supports the exact development origin', async () => {
    const development = { ...env, ALLOWED_ORIGIN: 'http://localhost:5173' };
    const response = await worker.fetch(new Request('https://worker.example/v1/import-html', { method: 'OPTIONS', headers: { Origin: development.ALLOWED_ORIGIN } }), development);
    expect(response.headers.get('access-control-allow-origin')).toBe(development.ALLOWED_ORIGIN);
  });
});
