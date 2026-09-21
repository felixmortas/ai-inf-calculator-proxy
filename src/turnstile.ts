import { RelayError } from './errors';
import type { Env } from './types';

interface TurnstileReply { success?: boolean; hostname?: string; action?: string }

export async function verifyTurnstile(token: string, request: Request, env: Env, signal: AbortSignal): Promise<void> {
  if (typeof token !== 'string' || token.length === 0) throw new RelayError('turnstile', 403);
  let response: Response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      // Do not disclose the caller IP to Turnstile; the token itself is sufficient.
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
    });
  } catch (error) {
    if (signal.aborted) throw new RelayError('timeout', 504);
    throw new RelayError('turnstile', 403);
  }
  let result: TurnstileReply;
  try { result = await response.json() as TurnstileReply; } catch { throw new RelayError('turnstile', 403); }
  if (!response.ok || result.success !== true || result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME) throw new RelayError('turnstile', 403);
}
