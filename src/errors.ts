export const errorCodes = [
  'policy', 'origin', 'method', 'turnstile', 'rate-limit', 'timeout', 'network',
  'http', 'content-type', 'response-too-large', 'redirect-disallowed', 'configuration',
] as const;

export type ErrorCode = typeof errorCodes[number];

export class RelayError extends Error {
  constructor(public readonly code: ErrorCode, public readonly status = 400) {
    super(code);
  }
}

export function errorResponse(code: ErrorCode, status = 400, origin?: string): Response {
  const headers = securityHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify({ ok: false, error: { code } }), { status, headers });
}

export function securityHeaders(origin?: string): Headers {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return headers;
}

export function preflightResponse(origin: string): Response {
  const headers = securityHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return new Response(null, { status: 204, headers });
}
