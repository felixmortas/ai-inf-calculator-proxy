# Technical Addendum — MVP Relay

## One endpoint, one algorithm

The Worker accepts `POST /v1/import-html` with `{ "shareUrl": string }` from its configured browser Origin. It rate counts requests before reading the JSON body, caps the body at 4,096 bytes including unknown-length streams, then validates the initial URL against four versioned canonical templates and calls `fetch` once with GET, `redirect: "follow"`, omitted credentials, no caller headers, and no cache. The runtime may follow multiple redirects to any destination. The Worker does not inspect or restrict redirect hops; runtime failures are mapped to an atomic typed error.

The final response must be successful HTML. The Worker reads the entire decoded body within 2 MiB and a 10-second request deadline before exposing it. It returns sanitized headers and no upstream headers. It uses no content parsing, secrets, persistent application logs, or storage.

For an upstream non-success response, the atomic JSON failure is `{ "ok": false, "error": { "code": "http", "upstreamStatus": <numeric status> } }`. It exposes no upstream body, headers, or URL.

## Configuration and tests

- Local Wrangler development allows `http://localhost:5173`. The deployed Worker allows exact origins `https://felixmortas.com` and `http://localhost:5173`; its `ALLOWED_LOCAL_ORIGIN` setting explicitly enables local Calculator development against the deployed endpoint. CORS responses reflect only a matched configured origin. Other origins receive a typed `origin` error without a CORS grant.
- Initial templates: `chatgpt.com/share/<uuid>`, `claude.ai/share/<uuid>`, `chat.mistral.ai/chat/<uuid>`, and `share.gemini.google/<12-alphanumeric-id>`. Initial URL limit: 2,048 characters.
- Native Cloudflare rate-limit binding: 10 requests per 60 seconds per `CF-Connecting-IP`; counters are approximate and location-local. No Durable Object or Turnstile configuration.
- Deployment migration `v2` deletes the former `RateLimiter` Durable Object namespace and its transient counters, after preserving the deployed `v1` migration history.
- Local Wrangler development uses a simulated native binding and needs no `.dev.vars` or remote services. It keys by `CF-Connecting-IP` when present; if the local runtime omits that header, all local requests share the `local-development` key. Production rejects a missing IP header.
- Controlled tests cover all four templates, automatic redirect behavior, invalid input, CORS, isolation, limits, and atomic errors. An optional deployed smoke check accepts operator-supplied endpoint, Origin, and share URL.
