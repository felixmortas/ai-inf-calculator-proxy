import { RelayError } from './errors';
import { maxUrlLength, providerFixtures } from './policy.fixtures';
import type { CanonicalUrl } from './types';

// Canonical RFC 4122 textual UUID; the registry accepts UUID paths only.
// The public providers issue UUIDs including newer RFC 9562 versions (for
// example ChatGPT's version-8 shares), so do not restrict the version nibble.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GEMINI_ID = /^[A-Za-z0-9]{12}$/;

function parse(raw: string): URL {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > maxUrlLength) throw new RelayError('policy');
  let url: URL;
  try { url = new URL(raw); } catch { throw new RelayError('policy'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) throw new RelayError('policy');
  return url;
}

function oneIdPath(url: URL, prefix: string, matcher: RegExp): string | undefined {
  if (!url.pathname.startsWith(prefix)) return undefined;
  const id = url.pathname.slice(prefix.length);
  return matcher.test(id) ? id : undefined;
}

export function canonicalizeShareUrl(raw: string): CanonicalUrl {
  const url = parse(raw);
  for (const provider of ['chatgpt', 'claude', 'mistral'] as const) {
    const fixture = providerFixtures[provider];
    const id = url.hostname === fixture.host && url.search === '' ? oneIdPath(url, fixture.pathPrefix, UUID) : undefined;
    if (id && raw === `https://${fixture.host}${fixture.pathPrefix}${id}`) return { provider, url, id };
  }
  const gemini = providerFixtures.gemini;
  const id = url.hostname === gemini.host && url.search === '' ? oneIdPath(url, gemini.pathPrefix, GEMINI_ID) : undefined;
  if (id && raw === `https://${gemini.host}/${id}`) return { provider: 'gemini', url, id };
  throw new RelayError('policy');
}
