import { RelayError } from './errors';
import { canonicalizeShareUrl } from './policy';

export const MAX_HTML_BYTES = 2 * 1024 * 1024;

function isHtml(contentType: string | null): boolean {
  return contentType !== null && /^text\/html(?:\s*;\s*charset=[^;\s]+)?\s*$/i.test(contentType);
}

export async function relayHtml(rawUrl: string, signal: AbortSignal): Promise<Uint8Array> {
  const initial = canonicalizeShareUrl(rawUrl);
  if (signal.aborted) throw new RelayError('timeout', 504);
  let response: Response;
  try {
    response = await fetch(initial.url, { method: 'GET', redirect: 'follow', credentials: 'omit', cache: 'no-store', signal });
  } catch {
    if (signal.aborted) throw new RelayError('timeout', 504);
    throw new RelayError('network', 502);
  }
  if (!response.ok) throw new RelayError('http', 502, response.status);
  if (!isHtml(response.headers.get('Content-Type'))) throw new RelayError('content-type', 502);
  const announced = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(announced) && announced > MAX_HTML_BYTES) throw new RelayError('response-too-large', 502);
  return readBounded(response.body, signal);
}

async function readBounded(body: ReadableStream<Uint8Array> | null, signal: AbortSignal): Promise<Uint8Array> {
  if (!body) throw new RelayError('network', 502);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new RelayError('timeout', 504)), { once: true });
  });
  try {
    for (;;) {
      if (signal.aborted) throw new RelayError('timeout', 504);
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_HTML_BYTES) throw new RelayError('response-too-large', 502);
      chunks.push(next.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof RelayError) throw error;
    if (signal.aborted) throw new RelayError('timeout', 504);
    throw new RelayError('network', 502);
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}
