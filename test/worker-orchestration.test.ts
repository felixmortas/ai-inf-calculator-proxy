import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayError } from '../src/errors';
import { MAX_JSON_BYTES } from '../src/index';

const mocks = vi.hoisted(() => ({ limit: vi.fn(), relay: vi.fn() }));
vi.mock('../src/rate-limit', () => ({ rateLimit: mocks.limit }));
vi.mock('../src/relay', () => ({ relayHtml: mocks.relay }));
const { default: worker } = await import('../src/index');

const env = { ALLOWED_ORIGIN: 'https://felixmortas.com', RATE_LIMITER: { limit: vi.fn() } } as any;
const url = 'https://claude.ai/share/123e4567-e89b-42d3-a456-426614174000';
function request(body: unknown = { shareUrl: url }, origin = env.ALLOWED_ORIGIN): Request {
  return new Request('https://worker.example/v1/import-html', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', Cookie: 'private=1', Authorization: 'Bearer private' }, body: JSON.stringify(body),
  });
}

describe('worker orchestration is gated and atomic', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.limit.mockResolvedValue(undefined); mocks.relay.mockResolvedValue(new TextEncoder().encode('<html>safe</html>')); });

  it('rate counts invalid input without fetching upstream', async () => {
    const response = await worker.fetch(request({ shareUrl: 'https://evil.example/' }), env);
    expect(response.status).toBe(400);
    expect(mocks.limit).toHaveBeenCalledTimes(1); expect(mocks.relay).not.toHaveBeenCalled();
  });

  it('rejects a canonical ChatGPT URL before fetching upstream', async () => {
    const response = await worker.fetch(request({ shareUrl: 'https://chatgpt.com/share/123e4567-e89b-42d3-a456-426614174000' }), env);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'policy' } });
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it('enforces the 4 KiB JSON bound with and without Content-Length', async () => {
    const base = JSON.stringify({ shareUrl: url });
    const atLimit = base.padEnd(MAX_JSON_BYTES, ' ');
    const headers = { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' };
    const exact = new Request('https://worker.example/v1/import-html', { method: 'POST', headers, body: atLimit });
    expect((await worker.fetch(exact, env)).status).toBe(200);
    const exactStream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(atLimit)); controller.close(); } });
    const unknownLengthExact = new Request('https://worker.example/v1/import-html', { method: 'POST', headers, body: exactStream, duplex: 'half' } as RequestInit & { duplex: 'half' });
    expect((await worker.fetch(unknownLengthExact, env)).status).toBe(200);
    const tooLarge = new Request('https://worker.example/v1/import-html', { method: 'POST', headers: { ...headers, 'Content-Length': String(MAX_JSON_BYTES + 1) }, body: atLimit + ' ' });
    expect((await worker.fetch(tooLarge, env)).status).toBe(400);
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(base)); controller.enqueue(new Uint8Array(MAX_JSON_BYTES)); controller.close(); } });
    const chunked = new Request('https://worker.example/v1/import-html', { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' });
    expect((await worker.fetch(chunked, env)).status).toBe(400);
    expect(mocks.limit).toHaveBeenCalledTimes(4);
    expect(mocks.relay).toHaveBeenCalledTimes(2);
  });

  it('does not relay when native rate limit rejects', async () => {
    mocks.limit.mockRejectedValueOnce(new RelayError('rate-limit', 429));
    const response = await worker.fetch(request(), env);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'rate-limit' } });
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it('applies the total deadline while rate limiting waits', async () => {
    vi.useFakeTimers();
    try {
      mocks.limit.mockImplementationOnce(() => new Promise(() => {}));
      const pending = worker.fetch(request(), env);
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'timeout' } });
      expect(mocks.relay).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('times out atomically on a never-ending request body', async () => {
    vi.useFakeTimers();
    try {
      const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"shareUrl":')); } });
      const pending = worker.fetch(new Request('https://worker.example/v1/import-html', {
        method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json' }, body: stream, duplex: 'half',
      } as RequestInit & { duplex: 'half' }), env);
      await vi.advanceTimersByTimeAsync(10_000);
      const response = await pending;
      expect(response.status).toBe(504);
      expect(await response.json()).toEqual({ ok: false, error: { code: 'timeout' } });
      expect(mocks.limit).toHaveBeenCalledTimes(1);
      expect(mocks.relay).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it.each(['timeout', 'network', 'http', 'content-type', 'response-too-large', 'configuration'] as const)('returns typed atomic %s without upstream headers', async code => {
    mocks.relay.mockRejectedValueOnce(new RelayError(code, 502));
    const response = await worker.fetch(request(), env);
    expect(await response.json()).toEqual({ ok: false, error: { code } });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('includes only the upstream HTTP status on an HTTP failure', async () => {
    mocks.relay.mockRejectedValueOnce(new RelayError('http', 502, 403));
    const response = await worker.fetch(request(), env);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'http', upstreamStatus: 403 } });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns sanitized complete HTML after rate limiting', async () => {
    const response = await worker.fetch(request(), env);
    expect(await response.text()).toBe('<html>safe</html>');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(env.ALLOWED_ORIGIN);
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.relay.mock.invocationCallOrder[0]);
    expect(mocks.relay).toHaveBeenCalledWith(url, expect.any(AbortSignal));
  });

  it('sends no caller headers or credentials to upstream fetch', async () => {
    const upstream = vi.fn().mockResolvedValue(new Response('<html>safe</html>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'upstream=1' } }));
    const originalFetch = globalThis.fetch;
    globalThis.fetch = upstream;
    try {
      const actual = await vi.importActual<typeof import('../src/relay')>('../src/relay');
      mocks.relay.mockImplementationOnce(actual.relayHtml);
      const response = await worker.fetch(request(), env);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('<html>safe</html>');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(upstream).toHaveBeenCalledTimes(1);
      expect(upstream.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store' });
      expect(upstream.mock.calls[0][1].headers).toBeUndefined();
    } finally { globalThis.fetch = originalFetch; }
  });
});
