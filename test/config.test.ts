import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

describe('recorded native rate limit', () => {
  it('configures 10 requests per 60 seconds in production and development', () => {
    expect(config).toMatch(/\[\[ratelimits\]\][\s\S]*?\[ratelimits\.simple\]\s*limit = 10\s*period = 60/);
    expect(config).toMatch(/\[\[env\.development\.ratelimits\]\][\s\S]*?\[env\.development\.ratelimits\.simple\]\s*limit = 10\s*period = 60/);
  });
  it('retires the previously deployed Durable Object class', () => {
    expect(config).toMatch(/\[durable_objects\]\s*bindings = \[\]/);
    expect(config).toMatch(/\[\[migrations\]\]\s*tag = "v1"\s*new_sqlite_classes = \["RateLimiter"\]/);
    expect(config).toMatch(/\[\[migrations\]\]\s*tag = "v2"\s*deleted_classes = \["RateLimiter"\]/);
  });
});
