---
title: 'Simplify the public share HTML relay'
type: 'refactor'
created: '2026-09-23'
status: 'done'
baseline_commit: 'ebb3d824e310270c7af560315313dcc56a4ec456'
review_loop_iteration: 0
context:
  - '_bmad-output/planning-artifacts/prds/prd-proxy-felix-2026-09-21/prd.md'
  - '_bmad-output/planning-artifacts/prds/prd-proxy-felix-2026-09-21/addendum.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The deployed Worker requires Turnstile secrets and a Durable Object, making a small browser import relay difficult to run and understand. The user needs one simple Cloudflare Worker callable from `https://felixmortas.com` in production and `http://localhost:5173` during local development.

**Approach:** Keep one JSON endpoint accepting a public share URL and returning complete HTML. Remove Turnstile and the Durable Object, use Cloudflare's native rate-limit binding, validate the initial provider URL, and let fetch follow subsequent redirects automatically.

## Boundaries & Constraints

**Always:** Use `POST /v1/import-html` with `{ "shareUrl": string }`; require the exact configured Origin and CORS preflight; fetch upstream via GET only, with no caller headers, cookies, credentials, cache, or forwarding of upstream headers. Accept only canonical HTTPS ChatGPT, Claude, Mistral, and Gemini public-share URL templates as initial input. Allow automatic redirects to any destination, including further redirects, without an application-level hop limit or redirect URL validation. Keep the existing 2,048-character initial URL, 10-second total timeout, and 2 MiB decoded-HTML limits. Return complete HTML or an atomic typed error. Keep the existing recorded 10 requests per minute per IP, with native Cloudflare rate limiting. Keep Free-plan compatibility and local `wrangler dev` support.

**Ask First:** Changes to the four provider URL templates, accepted browser origins, or external route beyond those specified here; production deployment or third-party service configuration.

**Never:** Accept arbitrary initial URLs or caller-selected fetch options, forward credentials, parse conversation content, cache HTML, store URLs or IP logs, add consent/session logic, or add Turnstile or a Durable Object.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Supported share | Exact production or local Origin and canonical provider URL | Complete `text/html` response, sanitized headers, one upstream GET if no redirect | Typed failure if upstream HTML is invalid or incomplete |
| Redirect chain | Supported initial URL redirects through multiple destinations | Let fetch follow redirects automatically without an application-defined hop limit and return only complete final HTML | Runtime redirect limits, network failures, and deadline expiry fail atomically |
| Invalid caller | Wrong or missing Origin, method, route, body, or share URL | No upstream request | Typed error and no CORS grant to foreign origins |
| Abuse or limits | Rate exceeded, timeout, or decoded body above 2 MiB | No partial HTML | Typed atomic failure |

</frozen-after-approval>

## Code Map

- `src/index.ts` -- request contract, Origin/CORS checks, deadline, relay orchestration; remove Turnstile invocation.
- `src/policy.fixtures.ts`, `src/policy.ts` -- versioned templates and canonical initial URL checks; remove redirect policy.
- `src/relay.ts` -- use automatic fetch redirects and retain all-or-nothing bounded HTML read.
- `src/rate-limit.ts`, `src/turnstile.ts`, `src/types.ts`, `src/errors.ts` -- replace Durable Object rate-limit code, remove Turnstile and secret types, retain typed errors.
- `wrangler.toml`, `.dev.vars.example`, `README.md` -- align Worker name/origins, native rate-limit binding, and local/production setup; remove secret setup.
- `test/*.test.ts`, `test/deployed.mjs` -- update request contract and cover all four templates, redirects, bounds, origin rejection, header isolation, and local behavior.
- `_bmad-output/planning-artifacts/prds/prd-proxy-felix-2026-09-21/{prd.md,addendum.md}` -- record revised interface, unrestricted redirects, rate limit, and removal of Turnstile/Durable Object.

## Tasks & Acceptance

**Execution:**

- [x] `src/policy.fixtures.ts`, `src/policy.ts`, `src/relay.ts` -- validate the initial URL only and use automatic redirects.
- [x] `src/index.ts`, `src/rate-limit.ts`, `src/types.ts`, `src/errors.ts` -- simplify browser contract and use a native per-IP limit; delete unused Turnstile code.
- [x] `wrangler.toml`, `.dev.vars.example`, `README.md` -- make local development and deployment configuration explicit without secrets.
- [x] `test/*.test.ts`, `test/deployed.mjs` -- verify the matrix and security boundaries with meaningful controlled upstream tests.
- [x] `_bmad-output/planning-artifacts/prds/prd-proxy-felix-2026-09-21/{prd.md,addendum.md}` -- record changed requirements and decisions.

**Acceptance Criteria:**

- Given either configured environment, when a browser at its exact allowed Origin calls the endpoint with a supported URL, then it receives only complete HTML or a typed error.
- Given a valid initial provider URL, when the upstream redirects to an external host or through multiple hops, then the Worker follows the chain and returns only complete final HTML or a typed failure.
- Given a local checkout, when the documented local commands run, then the Worker and a local browser site can communicate without Cloudflare secrets or remote services.

## Spec Change Log

## Design Notes

The native rate-limit binding uses the recorded 10 requests per 60 seconds. Its counters are approximate and local to a Cloudflare location; this is sufficient for basic abuse control. An Origin header is a browser access control signal, not authentication against non-browser clients.

## Verification

**Commands:**

- `npm test` -- expected: provider, redirect, isolation, limit, route, and origin coverage passes.
- `npm run typecheck` -- expected: no TypeScript errors.
- `npm run deploy:dry-run` -- expected: Wrangler accepts the Free-plan configuration without secrets.

## Suggested Review Order

**Request boundary**

- The endpoint checks Origin, applies rate limiting, and returns only complete HTML.
  [index.ts:36](../../src/index.ts#L36)

- The 4 KiB JSON reader bounds incoming streams within the shared deadline.
  [index.ts:9](../../src/index.ts#L9)

**Upstream relay**

- Four canonical templates constrain the initial URL.
  [policy.ts:25](../../src/policy.ts#L25)

- Automatic redirects fulfill the approved trust rule without forwarding caller headers.
  [relay.ts:11](../../src/relay.ts#L11)

- The final HTML is read completely under the decoded-byte limit.
  [relay.ts:27](../../src/relay.ts#L27)

**Abuse control and verification**

- The native binding replaces secrets and the Durable Object.
  [rate-limit.ts:4](../../src/rate-limit.ts#L4)

- Production and local environments carry their allowed Origin and 10/60 threshold.
  [wrangler.toml:1](../../wrangler.toml#L1)

- Controlled fetch tests prove an external two-hop redirect chain.
  [relay.test.ts:22](../../test/relay.test.ts#L22)

- Route tests cover invalid input, body limits, timeout, and header isolation.
  [worker-orchestration.test.ts:21](../../test/worker-orchestration.test.ts#L21)
