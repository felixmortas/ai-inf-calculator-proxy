# Public-share HTML relay

A narrowly scoped Cloudflare Worker for Calculator's public conversation import. It accepts only `POST /v1/import-html` from the configured Calculator origin with JSON `{ "shareUrl", "turnstileToken" }`. It returns complete HTML or `{ "ok": false, "error": { "code" } }`.

The worker accepts only versioned canonical public URLs for ChatGPT, Claude, Mistral, and Gemini. It uses HTTPS GET requests with manual redirects; only one exact Gemini redirect is permitted. It never forwards caller headers, cookies, authorization, Calculator data, or fetch options. It neither parses nor stores response contents.

## Setup

Copy `.dev.vars.example` to `.dev.vars` and fill the two secrets. Configure a Turnstile widget for the matching hostname. The development environment allows `http://localhost:5173`; production allows `https://felixmortas.com`.

The worker limits requests to 10 per IP per minute and 60 per hour using an HMAC-derived Durable Object key. It retains no raw IP, target URL, or HTML. A public provider may still observe a visitor's IP/user-agent while serving the public page; Calculator owns the related consent disclosure and manual-paste fallback.

## Verification

Run `npm install`, then `npm test`, `npm run typecheck`, `npm run lint`, and `npm run deploy:dry-run`. Before a deployment, run controlled upstream checks for all four initial URL fixtures, the sole Gemini redirect, rejected redirect destinations and second redirects, URL/method/origin/Turnstile/rate limits, timeout, non-HTML, 2 MiB overflow, and absence of forwarded credentials or response headers. `npm run test:deployed` is deliberately opt-in and requires controlled deployed fixtures.
