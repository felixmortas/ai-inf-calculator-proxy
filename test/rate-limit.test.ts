import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../src/rate-limit';

function limiter() {
  const counters = new Map<number, number>();
  const sql = {
    exec(query: string, ...args: number[]) {
      if (query.startsWith('INSERT')) { const key = args[0]; counters.set(key, (counters.get(key) ?? 0) + 1); return { one: () => ({}) }; }
      if (query.startsWith('SELECT')) return { one: () => ({ count: counters.get(args[0]) ?? 0 }) };
      if (query.startsWith('DELETE')) for (const key of counters.keys()) if (key < args[0] || (key >= args[1] && key < args[2])) counters.delete(key);
      return { one: () => ({}) };
    },
  };
  const setAlarm = vi.fn().mockResolvedValue(undefined);
  return { object: new RateLimiter({ storage: { sql, setAlarm } } as any), counters, setAlarm };
}

afterEach(() => vi.restoreAllMocks());

describe('Durable Object rate limiter', () => {
  it('allows ten requests per minute and rejects the eleventh', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(3_600_000);
    const { object, setAlarm } = limiter();
    for (let i = 0; i < 10; i++) expect((await object.fetch()).status).toBe(200);
    expect(await (await object.fetch()).json()).toEqual({ allowed: false });
    expect(setAlarm).toHaveBeenCalled();
  });

  it('enforces the hourly bound across minute buckets and cleans stale state', async () => {
    const clock = vi.spyOn(Date, 'now');
    const { object, counters } = limiter();
    for (let i = 1; i < 60; i++) { clock.mockReturnValue(i * 60_000); expect(await (await object.fetch()).json()).toEqual({ allowed: true }); }
    clock.mockReturnValue(59 * 60_000);
    expect(await (await object.fetch()).json()).toEqual({ allowed: true });
    expect(await (await object.fetch()).json()).toEqual({ allowed: false });
    expect(counters.size).toBeLessThanOrEqual(4);
  });
});
