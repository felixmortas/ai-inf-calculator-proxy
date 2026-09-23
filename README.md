# Public-share HTML relay

A Cloudflare Worker for Calculator's public conversation import. It accepts `POST /v1/import-html` with JSON `{ "shareUrl": "..." }` from an explicitly configured browser Origin. It applies the native rate limit before reading the JSON body and rejects bodies over 4,096 bytes, including streamed bodies without a Content-Length header. It returns complete `text/html` or `{ "ok": false, "error": { "code": "..." } }`. The Worker accepts versioned Claude, Mistral, and Gemini initial share URL templates. The ChatGPT template remains in the policy registry but is disabled; ChatGPT input returns a typed `policy` error before fetch. Fetch follows subsequent redirects automatically, including external destinations; runtime redirect failures return an atomic typed error.

The upstream request is a GET with no caller headers, cookies, authorization, credentials, or cache. The Worker never parses or stores conversation content and never forwards upstream headers. An `http` error includes only the numeric `upstreamStatus` for diagnosis. The Calculator owns consent, extraction, and manual fallback. Origin limits browser access; it is not authentication for non-browser clients.

## Local development

1. Run `npm install`.
2. Run `npx wrangler dev --env development`.
3. Run Calculator at `http://localhost:5173` and POST to `http://localhost:8787/v1/import-html` with `Content-Type: application/json` and `{ "shareUrl": "https://claude.ai/share/<canonical-uuid>" }`.

No `.dev.vars`, Turnstile secret, account service, or remote binding is required. Wrangler simulates the native rate-limit binding locally. The development environment accepts only `http://localhost:5173`. If the local runtime supplies `CF-Connecting-IP`, that value is the rate-limit key; otherwise all local requests share the `local-development` key. Production rejects requests without `CF-Connecting-IP`.

## Production configuration

The default Wrangler environment deploys the existing `proxy-felix` Worker and allows the exact origins `https://felixmortas.com` and `http://localhost:5173`. The localhost origin lets Calculator development call the deployed Worker. Other local hosts or ports, including `127.0.0.1`, remain rejected. The response grants CORS only to the matching request origin, including on typed errors. Its native rate-limit binding permits 10 calls per 60 seconds per `CF-Connecting-IP` in each Cloudflare location. Counters are approximate and ephemeral. The policy enforces a 2,048-character initial URL, a 10-second request deadline, and a 2 MiB decoded HTML body. No persistent IP or URL logs, analytics binding, or cache is configured. Deploying or configuring the external route requires operator approval.

The empty `durable_objects.bindings` declaration removes the old binding. The `v2` migration then retires the old `RateLimiter` Durable Object class during deployment. Its former rate-limit counters are deleted; the native binding handles new requests. If Cloudflare still reports error 10061, remove the old Durable Object binding named `RATE_LIMITER` from the deployed Worker's Bindings settings, then redeploy. Keep the new Rate Limit binding.

Run `npm test`, `npm run typecheck`, and `npm run deploy:dry-run` before deployment. In restricted local environments, set `XDG_CONFIG_HOME` to a writable directory for Wrangler logs. Run `npm run test:deployed` only when `DEPLOYED_RELAY_URL`, `DEPLOYED_ALLOWED_ORIGIN`, and `DEPLOYED_SHARE_URL` point to a controlled deployed test setup.
