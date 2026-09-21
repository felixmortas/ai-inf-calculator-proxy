import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayError } from '../src/errors';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), limit: vi.fn(), relay: vi.fn(),
}));
vi.mock('../src/turnstile', () => ({ verifyTurnstile: mocks.verify }));
vi.mock('../src/rate-limit', () => ({ rateLimit: mocks.limit, RateLimiter: class {} }));
vi.mock('../src/relay', () => ({ relayHtml: mocks.relay }));
const { default: worker } = await import('../src/index');

const env = { ALLOWED_ORIGIN: 'https://felixmortas.com', TURNSTILE_EXPECTED_HOSTNAME: 'felixmortas.com', TURNSTILE_SECRET_KEY: 'test-secret', RATE_LIMIT_HMAC_KEY: 'test-hmac' } as any;
const url = 'https://chatgpt.com/share/123e4567-e89b-42d3-a456-426614174000';
function request(body: unknown = { shareUrl: url, turnstileToken: 'token' }): Request {
  return new Request('https://worker.example/v1/import-html', {
    method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1' }, body: JSON.stringify(body),
  });
}

describe('worker orchestration is gated and atomic', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.verify.mockResolvedValue(undefined); mocks.limit.mockResolvedValue(undefined); mocks.relay.mockResolvedValue(new TextEncoder().encode('<html>safe</html>')); });

  it('does not call Turnstile, rate limiting, or relay for an invalid policy input', async () => {
    const response = await worker.fetch(request({ shareUrl: 'https://evil.example/', turnstileToken: 'token' }), env);
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.relay).not.toHaveBeenCalled();
  });

  it('does not relay when Turnstile or rate limit rejects', async () => {
    mocks.verify.mockRejectedValueOnce(new RelayError('turnstile', 403));
    let response = await worker.fetch(request(), env);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'turnstile' } });
    expect(mocks.limit).not.toHaveBeenCalled(); expect(mocks.relay).not.toHaveBeenCalled();
    mocks.verify.mockResolvedValueOnce(undefined); mocks.limit.mockRejectedValueOnce(new RelayError('rate-limit', 429));
    response = await worker.fetch(request(), env);
    expect(await response.json()).toEqual({ ok: false, error: { code: 'rate-limit' } });
    expect(mocks.relay).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'network', 'http', 'content-type', 'response-too-large', 'redirect-disallowed', 'configuration'] as const)('returns a typed atomic %s error without upstream headers', async code => {
    mocks.relay.mockRejectedValueOnce(new RelayError(code, 502));
    const response = await worker.fetch(request(), env);
    expect(await response.json()).toEqual({ ok: false, error: { code } });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  });

  it('returns a sanitised complete HTML response only after all gates pass', async () => {
    const response = await worker.fetch(request(), env);
    expect(await response.text()).toBe('<html>safe</html>');
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe(env.ALLOWED_ORIGIN);
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.limit.mock.invocationCallOrder[0]);
    expect(mocks.limit.mock.invocationCallOrder[0]).toBeLessThan(mocks.relay.mock.invocationCallOrder[0]);
  });
});
