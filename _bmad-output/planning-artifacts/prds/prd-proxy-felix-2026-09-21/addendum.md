# Technical Addendum — Cloudflare Worker Import Proxy

This addendum records implementation-oriented context; the PRD remains the product contract.

## Proposed boundary

The Worker should expose a single GET-only import route with an approved-Origin CORS policy. Approved origins are configured per Cloudflare environment: `http://localhost:5173` for development and `https://felixmortas.com` for production. At consent time, the browser obtains an ephemeral Turnstile token; the Worker verifies it server-side before any upstream fetch. Turnstile, origin allowlisting, and rate limiting are the chosen abuse protections, not a reusable browser secret.

The browser submits the complete policy derived from the locally verified Resolved Share. The Worker must recompute the expected host and URL shape from `providerId` and reject mismatches; it must not trust free-form client policy, redirect rules, method, headers, or `fetch` options.

Follow redirects manually: request with redirects disabled, validate each `Location` against the selected Provider policy, record the initial URL and each accepted hop, then fetch the next hop. Reject before reading or exposing a body when the chain is over its limit or a destination is disallowed. ChatGPT, Claude, and Mistral have zero redirects; Gemini permits one allowlisted redirect.

Stream and count the decoded response instead of calling `response.text()` unbounded. The Worker limits decoded HTML to 2 MB and total upstream time to 10 seconds. Check Content-Length opportunistically and enforce a counter when it is absent. Use a wall-clock race in addition to `AbortSignal`, because a fetch/body can fail to honor cancellation. On limit breach, cancel the body best-effort and return a typed failure immediately. The Worker performs no extraction or JSON parsing; the client local extractor limits output to three normalized text events.

## Cloudflare notes

- Workers add CORS headers themselves; restrict `Access-Control-Allow-Origin` to exact Calculator origins, return 204 to valid OPTIONS, limit methods, and use `Vary: Origin`.
- A Worker `fetch()` is appropriate for upstream retrieval. Caching is disabled (TTL 0).
- Cloudflare rate limiting is eventually consistent and local to an edge location. Apply 10 requests/minute/IP and an approximate 60/hour guard as abuse throttles, not correctness quotas.
- The Worker targets the Free plan. Its 10 ms CPU budget is compatible with streaming relay behavior because it does not parse HTML server-side.
- Use only Cloudflare's ephemeral native logs for immediate debugging. Do not attach Analytics Engine, a third-party observability service, or persistent custom IP-and-URL logs. Felix alone accesses the Cloudflare dashboard; native error-rate and request-volume thresholds provide alerting.

Useful primary documentation: [CORS header proxy](https://developers.cloudflare.com/workers/examples/cors-header-proxy/), [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), and [cache behavior](https://developers.cloudflare.com/workers/reference/how-the-cache-works/).

## Source decisions retained

- Epic 5 was rejected because corsproxy.io could not attest the final URL or redirect chain and Gemini was therefore refused before traffic.
- Keep consent at the Calculator boundary, Resolved Share attestation, closed Provider Registry, bounded response processing, local extractors, typed atomic failures, and manual fallback.
- Fix the retrospective gaps: real Worker redirect tests, surfaced inaccessible-content warnings, valid long-URL tests for Mistral/Gemini, and bounded recursive payload traversal.
