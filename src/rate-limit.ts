import { RelayError } from './errors';
import type { Env } from './types';

export async function rateLimit(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP');
  const key = ip || (env.ALLOWED_ORIGIN === 'http://localhost:5173' ? 'local-development' : null);
  if (!key) throw new RelayError('rate-limit', 429);
  try {
    const { success } = await env.RATE_LIMITER.limit({ key });
    if (!success) throw new RelayError('rate-limit', 429);
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError('configuration', 503);
  }
}
