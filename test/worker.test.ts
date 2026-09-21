import { describe, expect, it } from 'vitest';
import worker from '../src/index';

const env = { ALLOWED_ORIGIN: 'https://felixmortas.com' } as any;
describe('route security', () => {
  it('rejects an untrusted origin before any downstream work', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/import-html', { method: 'POST' }), env);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: { code: 'origin' } });
  });
  it('accepts no methods other than POST', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/import-html', { headers: { Origin: 'https://felixmortas.com' } }), env);
    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ ok: false, error: { code: 'method' } });
  });
  it('serves only a same-origin CORS preflight for the retrieval route', async () => {
    const response = await worker.fetch(new Request('https://worker.example/v1/import-html', { method: 'OPTIONS', headers: { Origin: 'https://felixmortas.com' } }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
  });
});
