import { afterEach, describe, expect, it, vi } from 'vitest';
import { relayHtml, MAX_HTML_BYTES } from '../src/relay';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const gemini = 'https://share.gemini.google/AbcD1234EfGh';
const originalFetch = globalThis.fetch;
const signal = new AbortController().signal;

afterEach(() => { globalThis.fetch = originalFetch; });

describe('bounded atomic relay', () => {
  it('returns only a complete final HTML body with GET/manual/no credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    globalThis.fetch = fetcher;
    await expect(relayHtml(`https://chatgpt.com/share/${uuid}`, signal)).resolves.toEqual(new TextEncoder().encode('<html>ok</html>'));
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store' });
  });

  it('follows one allowed Gemini redirect only', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: `https://gemini.google.com/share/ZyxW9876VutS?skid=${uuid}` } }))
      .mockResolvedValueOnce(new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html' } }));
    await expect(relayHtml(gemini, signal)).resolves.toBeInstanceOf(Uint8Array);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects disallowed redirects and never exposes a body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not exposed', { status: 302, headers: { Location: 'https://evil.example' } }));
    await expect(relayHtml(`https://chatgpt.com/share/${uuid}`, signal)).rejects.toMatchObject({ code: 'redirect-disallowed' });
  });

  it('rejects malformed and second redirects atomically', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'not a valid target' } }));
    await expect(relayHtml(gemini, signal)).rejects.toMatchObject({ code: 'redirect-disallowed' });

    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: `https://gemini.google.com/share/ZyxW9876VutS?skid=${uuid}` } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: `https://gemini.google.com/share/ZyxW9876VutS?skid=${uuid}` } }));
    await expect(relayHtml(gemini, signal)).rejects.toMatchObject({ code: 'redirect-disallowed' });
  });

  it('returns timeout before a fetch when the single deadline is exhausted', async () => {
    const aborted = new AbortController();
    aborted.abort();
    globalThis.fetch = vi.fn();
    await expect(relayHtml(`https://chatgpt.com/share/${uuid}`, aborted.signal)).rejects.toMatchObject({ code: 'timeout' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [new Response('x', { status: 500 }), 'http'],
    [new Response('x', { headers: { 'Content-Type': 'application/json' } }), 'content-type'],
    [new Response(new Uint8Array(MAX_HTML_BYTES + 1), { headers: { 'Content-Type': 'text/html' } }), 'response-too-large'],
  ])('returns typed atomic %s failure', async (response, code) => {
    globalThis.fetch = vi.fn().mockResolvedValue(response);
    await expect(relayHtml(`https://chatgpt.com/share/${uuid}`, signal)).rejects.toMatchObject({ code });
  });
});
