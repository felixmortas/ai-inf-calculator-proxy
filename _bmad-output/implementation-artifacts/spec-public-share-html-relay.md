---
title: 'Public-share HTML relay Worker'
type: 'feature'
created: '2026-09-21'
status: 'in-progress'
baseline_commit: 'c23365b80d7d98059375d69f59ee4e2ddb97c78d'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/prds/prd-ai-inf-calculator-proxy-2026-09-21/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-ai-inf-calculator-proxy-2026-09-21/addendum.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Calculator currently relies on a third-party proxy to retrieve public conversation pages. It needs a self-hosted, narrowly scoped Cloudflare Worker that returns only a bounded, final HTML document or a typed failure.

**Approach:** Ship a TypeScript Worker with an explicit versioned four-provider URL policy, server-side Turnstile verification, per-IP abuse controls, manually validated redirects, and streaming response bounds. The Calculator keeps consent lifecycle and all extraction/state mutation.

## Boundaries & Constraints

**Always:** Expose only `POST /v1/import-html`, accepting JSON `{ "shareUrl": string, "turnstileToken": string }`; require the matching configured origin (`http://localhost:5173` locally, `https://felixmortas.com` in production), validate Turnstile before any upstream fetch, and return JSON typed failures `{ ok: false, error: { code } }` or complete `text/html; charset=utf-8`. Canonicalize URL before fetch: HTTPS, no port/userinfo/fragment, <=2,048 characters; UUID paths for ChatGPT/Claude/Mistral and a 12-character ASCII alphanumeric Gemini id. Fetch GET only with `redirect: 'manual'`, no credentials, cookies, caller headers/options, caching, parsing, logging, or partial body output. Only Gemini may make one redirect, exactly to `https://gemini.google.com/share/<id>?skid=<uuid>`; all other redirects fail. Bound the whole operation to 10 seconds and decoded HTML to 2 MiB. Enforce 10 requests/minute/IP according to cloudflare documentation, short-lived rate-limit state only; never retain IPs, URLs, or HTML in logs/storage. Set only sanitized CORS, content type, `Cache-Control: no-store`, and security headers.

**Ask First:** Any provider policy expansion, public route/interface change, origin change, storage/logging/analytics addition, relaxed redirect rule, or deployment outside the Cloudflare Free plan.

**Never:** Become a general proxy; accept arbitrary URLs or client policy; parse HTML/JSON conversation content; forward Calculator data, authorization, cookies, API keys, or upstream headers; cache/relay challenge or cookie headers; make local extraction or Calculator state changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Accepted share | Allowed origin, valid Turnstile, canonical ChatGPT/Claude/Mistral/Gemini URL, final HTML <=2 MiB | `200 text/html` with the complete body only after all checks | No cache or upstream headers |
| Gemini redirect | Initial Gemini URL responds with one exact canonical Gemini target and final HTML | One manual GET of the approved target, then full body | Any malformed/noncanonical/second redirect is atomic `redirect-disallowed` |
| Policy violation | Unsupported or noncanonical URL, redirect for another provider, wrong origin/method/body | No upstream request | Typed `policy`, `origin`, or `method` failure |
| Abuse/auth failure | Missing/invalid Turnstile or limit exceeded | No upstream request | Typed `turnstile` or `rate-limit` failure |
| Unsafe upstream | Timeout, network/HTTP failure, non-HTML content, 2 MiB overflow or malformed `Location` | No response body is exposed | Typed atomic `timeout`, `network`, `http`, `content-type`, `response-too-large`, or `redirect-disallowed` |

</frozen-after-approval>

## Code Map

- `src/index.ts` -- new Worker entrypoint; method/path/origin validation, request decoding, Turnstile/rate-limit/relay orchestration, typed HTTP responses and CORS.
- `src/policy.fixtures.ts` -- new immutable `policyVersion` and exact provider URL/redirect fixtures; sole policy source.
- `src/policy.ts` -- new pure URL canonicalizer and provider-specific redirect transition validator; no network access.
- `src/turnstile.ts` -- new server-side `siteverify` request with secret binding and expected origin/hostname validation.
- `src/rate-limit.ts` -- new Durable Object using a keyed HMAC of `CF-Connecting-IP`, minute/hour counters, expiry alarm and no target URL/IP persistence.
- `src/relay.ts` -- new HTTPS GET-only manual-fetch loop, one deadline, MIME validation and all-or-nothing bounded stream read.
- `src/errors.ts`, `src/types.ts` -- new closed typed error contract and environment/request types.
- `wrangler.toml` -- new Free-plan Worker, local/production origin variables, SQLite Durable Object binding/migration; no analytics or persistent logs.
- `package.json`, `tsconfig.json`, `vitest.config.ts` -- new reproducible TypeScript/Wrangler test tooling.
- `test/policy.test.ts`, `test/relay.test.ts`, `test/worker.test.ts`, `test/rate-limit.test.ts` -- new unit and Miniflare integration coverage, including controlled upstream behavior.
- `.dev.vars.example`, `README.md` -- new secret-free local configuration, Calculator request contract, deployment and controlled/deployed verification instructions.

## Tasks & Acceptance

**Execution:**

- [x] `package.json`, `tsconfig.json`, `vitest.config.ts`, `wrangler.toml`, `.dev.vars.example` -- scaffold the standalone Cloudflare Worker and Free-plan bindings with no secret committed.
- [x] `src/types.ts`, `src/errors.ts`, `src/policy.fixtures.ts`, `src/policy.ts` -- implement the versioned closed policy and deterministic canonicalization/redirect validation.
- [x] `src/turnstile.ts`, `src/rate-limit.ts` -- verify one supplied token server-side and enforce privacy-preserving minute/hour IP throttles before upstream access.
- [x] `src/relay.ts`, `src/index.ts` -- implement the endpoint, strict fetch algorithm, all-or-nothing body handling, and sanitized response/error headers.
- [ ] `test/*.test.ts` -- test the policy, controlled final/redirect upstreams, failure atomicity, egress isolation, limits and route security using Miniflare. Local unit coverage is complete; Miniflare and controlled/deployed integration fixtures remain to be supplied.
- [x] `README.md` -- document the contract, required secrets/configuration, privacy disclosure, local tests, and mandatory deployed/controlled-worker verification matrix.

**Acceptance Criteria:**

- Given each supplied canonical provider URL, when the Worker receives an authorized request and controlled HTML upstream, then it returns complete HTML and performs no other upstream request.
- Given a request would change the selected provider URL, identity, policy, configuration, or consent state, when the Calculator cancels it, then it sends no Worker request; the Worker design accepts no Calculator state beyond URL and Turnstile token.
- Given redirects, content-type/size/time violations, invalid Turnstile, limits, or upstream failures, when the Worker evaluates them, then it returns a closed typed error, no partial HTML, and no upstream response headers.
- Given a request attempts to carry cookies, authorization, custom headers, non-GET upstream options, URLs, or content for extraction, when it reaches the Worker, then none is forwarded, parsed, stored, or logged.
- Given the configured development or production deployment, when integration tests exercise all four providers and the redirect matrix against controlled/deployed upstreams, then outcomes match the local suite and manual import remains a Calculator responsibility.

## Design Notes

The generic Calculator `maxRedirects: 3` remains an input-side legacy bound, not authority for this Worker. The Worker policy is independently closed and stricter: 0 for three providers and 1 for Gemini. A Free-plan SQLite Durable Object provides the hour window that the native rate-limit binding cannot express, storing only an HMAC-derived key with an expiry; it is rate-limit state rather than an IP/URL log.

## Verification

**Commands:**

- `npm test` -- expected: policy, controlled upstream, route, bounds, and rate-limit tests pass.
- `npm run typecheck` -- expected: Worker and binding types pass with no errors.
- `npm run lint` -- expected: no lint errors.
- `npm run deploy:dry-run` -- expected: Wrangler validates the Worker and Free-plan configuration without publishing.
- `npm run test:deployed` -- expected: opt-in controlled/deployed Worker matrix passes for four providers, redirects, and safety bounds.
