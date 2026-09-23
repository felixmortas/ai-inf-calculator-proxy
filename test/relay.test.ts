import { afterEach, describe, expect, it, vi } from 'vitest';
import { relayHtml, MAX_HTML_BYTES } from '../src/relay';
import { fetch as undiciFetch, getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const start = `https://claude.ai/share/${uuid}`;
const originalFetch = globalThis.fetch;
const signal = new AbortController().signal;

afterEach(() => { globalThis.fetch = originalFetch; });

describe('bounded atomic relay', () => {
  it('uses one isolated GET with automatic redirects and returns complete HTML', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html', 'Set-Cookie': 'upstream=1' } }));
    globalThis.fetch = fetcher;
    await expect(relayHtml(start, signal)).resolves.toEqual(new TextEncoder().encode('<html>ok</html>'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store' });
    expect(fetcher.mock.calls[0][1].headers).toBeUndefined();
  });

  it('accepts final HTML after an external multi-hop chain handled by fetch', async () => {
    const agent = new MockAgent();
    const previous = getGlobalDispatcher();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
    const fetcher = vi.fn((input: URL, init: RequestInit) => undiciFetch(input, init as any));
    globalThis.fetch = fetcher as unknown as typeof fetch;
    const noCallerHeaders = (headers: unknown) => {
      const value = JSON.stringify(headers).toLowerCase();
      expect(value).not.toContain('private=1');
      expect(value).not.toContain('bearer private');
    };
    agent.get('https://claude.ai').intercept({ path: `/share/${uuid}`, method: 'GET' }).reply(options => {
      noCallerHeaders(options.headers);
      return { statusCode: 302, data: '', responseOptions: { headers: { Location: 'https://external.example/step' } } };
    });
    agent.get('https://external.example').intercept({ path: '/step', method: 'GET' }).reply(options => {
      noCallerHeaders(options.headers);
      return { statusCode: 301, data: '', responseOptions: { headers: { Location: 'https://final.example/page' } } };
    });
    agent.get('https://final.example').intercept({ path: '/page', method: 'GET' }).reply(options => {
      noCallerHeaders(options.headers);
      return { statusCode: 200, data: '<html>final</html>', responseOptions: { headers: { 'Content-Type': 'text/html' } } };
    });
    try {
      await expect(relayHtml(start, signal)).resolves.toEqual(new TextEncoder().encode('<html>final</html>'));
      expect(fetcher).toHaveBeenCalledTimes(1);
      agent.assertNoPendingInterceptors();
    } finally {
      setGlobalDispatcher(previous);
      await agent.close();
    }
  });

  it('maps runtime redirect failure to an atomic network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('too many redirects'));
    await expect(relayHtml(start, signal)).rejects.toMatchObject({ code: 'network' });
  });

  it('returns timeout before fetch when the deadline is exhausted', async () => {
    const aborted = new AbortController(); aborted.abort(); globalThis.fetch = vi.fn();
    await expect(relayHtml(start, aborted.signal)).rejects.toMatchObject({ code: 'timeout' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    [new Response('x', { status: 500 }), 'http'],
    [new Response('x', { headers: { 'Content-Type': 'application/json' } }), 'content-type'],
    [new Response(new Uint8Array(MAX_HTML_BYTES + 1), { headers: { 'Content-Type': 'text/html' } }), 'response-too-large'],
  ])('returns typed atomic %s failure', async (response, code) => {
    globalThis.fetch = vi.fn().mockResolvedValue(response);
    await expect(relayHtml(start, signal)).rejects.toMatchObject({ code });
  });
  it('keeps the upstream status when reporting an HTTP failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('blocked', { status: 403 }));
    await expect(relayHtml(start, signal)).rejects.toMatchObject({ code: 'http', upstreamStatus: 403 });
  });

  it('accepts exactly 2 MiB decoded bytes and rejects an incomplete body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array(MAX_HTML_BYTES), { headers: { 'Content-Type': 'text/html' } }));
    await expect(relayHtml(start, signal)).resolves.toHaveLength(MAX_HTML_BYTES);
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('truncated')); } });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/html' } }));
    await expect(relayHtml(start, signal)).rejects.toMatchObject({ code: 'network' });
  });
  it('rejects an announced oversized body before reading', async () => {
    const body = new ReadableStream<Uint8Array>({ pull() { throw new Error('should not read'); } });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/html', 'Content-Length': String(MAX_HTML_BYTES + 1) } }));
    await expect(relayHtml(start, signal)).rejects.toMatchObject({ code: 'response-too-large' });
  });
  it('does not wait for reader cancellation after a size failure', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(MAX_HTML_BYTES + 1)); },
      cancel() { return new Promise<void>(() => {}); },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/html' } }));
    await expect(relayHtml(start, signal)).rejects.toMatchObject({ code: 'response-too-large' });
  });
  it('does not wait for reader cancellation after a timeout', async () => {
    let reading!: () => void;
    const readStarted = new Promise<void>(resolve => { reading = resolve; });
    const body = new ReadableStream<Uint8Array>({
      pull() { reading(); return new Promise<void>(() => {}); },
      cancel() { return new Promise<void>(() => {}); },
    });
    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/html' } }));
    const pending = relayHtml(start, controller.signal);
    await readStarted;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'timeout' });
  });
});
