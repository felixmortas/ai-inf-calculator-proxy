import { RelayError } from './errors';
import type { Env, RateLimitResult } from './types';

const encoder = new TextEncoder();
const HOUR_BUCKET_OFFSET = 10_000_000_000;

export async function rateLimit(request: Request, env: Env): Promise<void> {
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) throw new RelayError('rate-limit', 429);
  const key = await hmac(ip, env.RATE_LIMIT_HMAC_KEY);
  const id = env.RATE_LIMITER.idFromName(key);
  const response = await env.RATE_LIMITER.get(id).fetch('https://rate-limit/check');
  if (!response.ok) throw new RelayError('rate-limit', 429);
  const outcome = await response.json() as RateLimitResult;
  if (!outcome.allowed) throw new RelayError('rate-limit', 429);
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export class RateLimiter implements DurableObject {
  private readonly sql: SqlStorage;
  constructor(private readonly state: DurableObjectState) {
    this.sql = state.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counters (bucket INTEGER PRIMARY KEY, count INTEGER NOT NULL)');
  }

  async fetch(): Promise<Response> {
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const hour = Math.floor(now / 3_600_000);
    const minuteCount = this.increment(minute);
    const hourCount = this.increment(hour + HOUR_BUCKET_OFFSET); // namespace avoids bucket collisions
    // Keep only the current/previous minute and current/previous hour. The
    // instance key is an HMAC, so this is bounded opaque rate-limit state.
    this.sql.exec(
      'DELETE FROM counters WHERE bucket < ? OR (bucket >= ? AND bucket < ?)',
      minute - 1,
      HOUR_BUCKET_OFFSET,
      HOUR_BUCKET_OFFSET + hour - 1,
    );
    await this.state.storage.setAlarm((hour + 2) * 3_600_000);
    return Response.json({ allowed: minuteCount <= 10 && hourCount <= 60 });
  }

  async alarm(): Promise<void> { this.sql.exec('DELETE FROM counters'); }

  private increment(bucket: number): number {
    this.sql.exec('INSERT INTO counters (bucket, count) VALUES (?, 1) ON CONFLICT(bucket) DO UPDATE SET count = count + 1', bucket);
    return Number(this.sql.exec('SELECT count FROM counters WHERE bucket = ?', bucket).one().count);
  }
}
