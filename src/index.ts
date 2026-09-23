import { errorResponse, preflightResponse, RelayError, securityHeaders } from './errors';
import { canonicalizeShareUrl } from './policy';
import { rateLimit } from './rate-limit';
import { relayHtml } from './relay';
import type { Env, ImportRequest } from './types';

export const MAX_JSON_BYTES = 4_096;

async function readJson(request: Request, deadline: Promise<never>): Promise<ImportRequest> {
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > MAX_JSON_BYTES) throw new RelayError('policy');
  if (!request.body) throw new RelayError('policy');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_JSON_BYTES) throw new RelayError('policy');
      chunks.push(next.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof RelayError) throw error;
    throw new RelayError('policy');
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as ImportRequest; }
  catch { throw new RelayError('policy'); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const allowedOrigin = origin !== null && (origin === env.ALLOWED_ORIGIN || origin === env.ALLOWED_LOCAL_ORIGIN);
    if (!allowedOrigin) return errorResponse('origin', 403);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/v1/import-html' && !url.search) return preflightResponse(origin);
    if (request.method !== 'POST') return errorResponse('method', 405, origin);
    if (url.pathname !== '/v1/import-html' || url.search || request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return errorResponse('policy', 400, origin);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const deadline = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new RelayError('timeout', 504)), { once: true });
    });
    try {
      if (!env.RATE_LIMITER) {
        throw new RelayError('configuration', 503);
      }
      await Promise.race([rateLimit(request, env), deadline]);
      const input = await readJson(request, deadline);
      if (!input || typeof input.shareUrl !== 'string') throw new RelayError('policy');
      canonicalizeShareUrl(input.shareUrl);
      const html = await Promise.race([relayHtml(input.shareUrl, controller.signal), deadline]);
      const headers = securityHeaders(origin);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(new Uint8Array(html).buffer, { status: 200, headers });
    } catch (error) {
      if (error instanceof RelayError) return errorResponse(error.code, error.status, origin, error.upstreamStatus);
      return errorResponse(controller.signal.aborted ? 'timeout' : 'network', controller.signal.aborted ? 504 : 502, origin);
    } finally { clearTimeout(timeout); }
  },
};
