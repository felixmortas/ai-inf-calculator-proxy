---
title: MVP PRD — Public-Share HTML Relay
status: final
created: 2026-09-21
updated: 2026-09-23
---

# Public-Share HTML Relay

## Goal

Replace the third-party import proxy with one self-hosted Cloudflare Worker. The Calculator sends a supported public conversation-share URL; the Worker returns complete final HTML or a typed error. The Calculator retains consent, local extraction, preview, state changes, and manual paste fallback.

## Requirements

### FR-1 — Browser request boundary

- Expose only `POST /v1/import-html` with JSON `{ "shareUrl": string }`, plus its CORS preflight.
- Permit only exact configured origins: `http://localhost:5173` in local development, and both `http://localhost:5173` and `https://felixmortas.com` on the deployed Worker so the local Calculator can call it. Return CORS headers for the matching allowed origin on preflight, HTML, and typed errors. Origin is browser access control, not authentication for non-browser clients.
- Rate count valid-route JSON requests before reading the body. Reject JSON bodies over 4,096 bytes, including streamed bodies without Content-Length.
- Never forward Calculator data, caller headers, cookies, authorization, credentials, API keys, or caller-selected fetch options. Upstream requests are GET only.

### FR-2 — Initial public-share URL policy

- Accept only canonical, versioned initial share URLs: Claude `https://claude.ai/share/<uuid>`, Mistral `https://chat.mistral.ai/chat/<uuid>`, and Gemini `https://share.gemini.google/<12-alphanumeric-id>`. Keep the ChatGPT `https://chatgpt.com/share/<uuid>` template in the versioned policy registry with `enabled: false`; reject ChatGPT input with a typed `policy` error before fetch.
- Reject every other initial scheme, host, port, credential-bearing URL, fragment, query, path shape, or initial URL over 2,048 characters before fetch.
- The Worker validates the initial URL only. Fetch automatically follows all subsequent redirects, including external hosts and multiple hops. There is no application redirect limit or redirect-target validation. Runtime redirect limits and failures cause a typed atomic error.

### FR-3 — Bounded HTML response

- Return only complete HTML with sanitized headers, or a typed error; never return partial HTML or upstream cookies, challenge headers, or other response headers. An upstream non-success response produces an `http` error with its numeric `upstreamStatus` only.
- Enforce a 10-second total deadline, a 2 MiB decoded-byte limit, and no cache. The Worker does not parse or extract conversation content.

### FR-4 — Abuse controls and operations

- Use Cloudflare's native rate-limit binding for 10 requests per 60 seconds per IP. Its counters are approximate and local to a Cloudflare location.
- Support local `wrangler dev` without secrets or remote services and Cloudflare Free deployment. Use native ephemeral logs only; do not store HTML, target URLs, or persistent IP records.
- Test all enabled initial providers, disabled ChatGPT URLs, invalid URLs, automatic redirects, CORS and origin rejection, header isolation, rate rejection, size and timeout boundaries, and typed atomic failures.

## Non-goals

Arbitrary initial URLs, authenticated fetching, server-side extraction, content storage, analytics, caching, and Calculator consent or session logic.

## Definition of done

The versioned initial URL fixtures, bounded Worker, native rate limit, local setup, tests, and operator documentation agree with this contract.
