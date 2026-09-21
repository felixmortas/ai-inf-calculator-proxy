import { errorResponse, preflightResponse, RelayError, securityHeaders } from './errors';
import { canonicalizeShareUrl } from './policy';
import { rateLimit, RateLimiter } from './rate-limit';
import { relayHtml } from './relay';
import { verifyTurnstile } from './turnstile';
import type { Env, ImportRequest } from './types';

export { RateLimiter };
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (origin !== env.ALLOWED_ORIGIN) return errorResponse('origin', 403);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/v1/import-html' && !url.search) return preflightResponse(origin);
    if (request.method !== 'POST') return errorResponse('method', 405, origin);
    if (url.pathname !== '/v1/import-html' || url.search || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return errorResponse('policy', 400, origin);
    let input: ImportRequest;
    try { input = await request.json() as ImportRequest; } catch { return errorResponse('policy', 400, origin); }
    if (!input || typeof input.shareUrl !== 'string' || typeof input.turnstileToken !== 'string') return errorResponse('policy', 400, origin);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      if (!env.TURNSTILE_SECRET_KEY || !env.RATE_LIMIT_HMAC_KEY || !env.TURNSTILE_EXPECTED_HOSTNAME) {
        throw new RelayError('configuration', 503);
      }
      // Reject invalid URLs before any external verification or upstream request.
      canonicalizeShareUrl(input.shareUrl);
      await verifyTurnstile(input.turnstileToken, request, env, controller.signal);
      await rateLimit(request, env);
      const html = await relayHtml(input.shareUrl, controller.signal);
      const headers = securityHeaders(origin);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(new Uint8Array(html).buffer, { status: 200, headers });
    } catch (error) {
      if (error instanceof RelayError) return errorResponse(error.code, error.status, origin);
      return errorResponse(controller.signal.aborted ? 'timeout' : 'network', controller.signal.aborted ? 504 : 502, origin);
    } finally { clearTimeout(timeout); }
  },
};
