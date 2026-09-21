---
title: Cloudflare Worker Remote Conversation Import Proxy
status: final
created: 2026-09-21
updated: 2026-09-21
---

# PRD: Cloudflare Worker Remote Conversation Import Proxy

## 0. Document Purpose

This PRD defines the product contract for the self-hosted proxy that replaces corsproxy.io in the calculator's remote conversation-import flow. It is for the calculator team, the Worker implementer, and QA. It preserves the Epic 5 safety boundary while closing the rejected epic's redirect-verification gap. The browser and its existing closed provider registry remain the source of validation, consent, local extraction, and session mutation; this service is a narrowly scoped retrieval boundary, not a general-purpose web proxy.

Implementation mechanisms, Cloudflare platform notes, and proposed endpoint details are in `addendum.md`.

## 1. Vision

Someone using the calculator can import the publicly shared conversation they intentionally selected from ChatGPT, Claude, Mistral, or Gemini, while keeping their calculator session private. The Worker makes this possible without relying on a rate-limited third-party proxy and without relaxing the consent, allowlist, or bounded-processing guarantees established in Epic 5.

The Worker is trusted only to retrieve a specific, already validated public share. It must prove that the request stayed inside the provider's redirect policy before the browser receives any content. A failure is safe and unsurprising: the calculator keeps its current state and the person can paste content manually.

## 2. Target User

### 2.1 Jobs To Be Done

- Import the text of a public shared chatbot conversation into the calculator after giving explicit consent.
- Understand which third party receives the shared URL and what information can be exposed by the import.
- Recover safely from an unavailable, rejected, oversized, redirected, or structurally changed share by using manual import.

### 2.2 Non-Users (v1)

- People trying to fetch arbitrary websites, authenticated content, private shares, files, APIs, or a URL on behalf of another application.
- Callers that do not originate from the calculator's approved web origin.

### 2.3 Key User Journeys

- **UJ-1. Felix imports a supported public share.** Felix pastes a valid public share URL into the calculator. The local **Provider Registry** canonicalizes it and identifies its **Provider** without network access. After reading the disclosure and giving **Import Consent**, Felix starts the import. The calculator sends only the current canonical URL and the minimum request context to the **Import Proxy**. The proxy verifies every **Redirect Chain** against the Provider policy, returns bounded HTML only when compliant, and the local extractor presents ordered text plus explicit inaccessible-content warnings. Felix can review and accept the preview.

- **UJ-2. Felix encounters a prohibited redirect or service failure.** Felix consents to import a Gemini share. A redirect is either outside the Gemini allowlist or exceeds the permitted chain. The Import Proxy returns a typed error and no content. The calculator leaves existing blocks and calculations unchanged, clearly explains the failure, and keeps manual import available.

## 3. Glossary

- **Calculator** — The browser-based conversation calculator consuming the Import Proxy.
- **Import Proxy** — The Cloudflare Worker that fetches only an approved public share under this PRD.
- **Provider** — One of ChatGPT, Claude, Mistral, or Gemini as identified by the Calculator's closed Provider Registry.
- **Provider Registry** — Calculator-owned closed registry that validates and canonicalizes supported public share URLs offline.
- **Resolved Share** — Registry-attested representation of one current canonical public share and its Provider; it is not a client-forgeable Worker authorization.
- **Import Consent** — Explicit, request-specific, one-use user confirmation tied to the current Resolved Share and Calculator policy/configuration.
- **Redirect Policy** — Provider-specific maximum number of redirects and allowed destination hosts.
- **Redirect Chain** — Ordered initial URL, every redirect destination, and final URL observed and validated by the Import Proxy.
- **Bounded HTML** — Complete HTML response accepted only after the configured size, time, response-type, and redirect bounds pass; it is never partial.
- **Inaccessible Content** — Non-text or unavailable public conversation content that the local extractor reports without reading or inventing text.

## 4. Features

### 4.1 Restricted Import API

**Description:** The Import Proxy exposes one minimal retrieval capability for the Calculator. It is not an open proxy and cannot be used to choose arbitrary upstream URLs, methods, headers, or credentials. Realizes UJ-1 and UJ-2.

#### FR-1: Approved-origin access

The Import Proxy accepts a cross-origin request only from an approved Calculator origin and responds to preflight only for the allowed retrieval method.

**Consequences (testable):**

- Requests from an unapproved Origin receive no permissive CORS response and no upstream request is made.
- The CORS response permits only the documented method and request headers, includes `Vary: Origin`, and never enables credentialed browser requests.
- The development environment permits only `http://localhost:5173`; the production environment permits only `https://felixmortas.com`. These origins are separate Cloudflare environment variables, not a browser-controlled setting.

#### FR-2: Minimal immutable request

The Calculator can request one canonical public share, but cannot supply an upstream method, arbitrary header, cookie, authorization value, redirect rule, or proxy target.

**Consequences (testable):**

- The upstream request is GET-only, HTTPS-only, uses no incoming cookies or authorization, and does not forward Calculator session data, blocks, files, results, model parameters, or tokens.
- The only user-selected destination is the current canonical public share URL from the Resolved Share.
- Unsupported methods, malformed requests, missing required request binding, and non-canonical URLs fail before any upstream request.

#### FR-3: Request-specific consent boundary

The Calculator invokes the Import Proxy only after valid Import Consent for the current Resolved Share; the integration must not recreate an arbitrary-URL route or reuse stale consent. Realizes UJ-1.

**Consequences (testable):**

- Refusal, cancellation, Escape, manual-import selection, URL change, Provider change, policy/configuration change, or consumed consent causes zero Import Proxy request and zero Calculator mutation.
- At consent time, the Calculator obtains an ephemeral Cloudflare Turnstile token and submits it with the import request. The Import Proxy verifies the token server-side before any upstream request; an expired, reused, missing, or invalid token fails before fetch.
- The Turnstile token is not a reusable secret. It is used with approved-origin CORS and rate limiting as the selected domain-abuse protection; it does not authorize a caller to provide an arbitrary URL or Provider policy.

### 4.2 Provider and Redirect Enforcement

**Description:** The Import Proxy independently enforces the same closed, per-Provider network boundary represented by the Provider Registry. It validates every step before exposing content. This replaces the historical corsproxy.io workaround that rejected Gemini before traffic because no redirect chain could be attested.

#### FR-4: Closed Provider policy

The Import Proxy accepts only canonical public share URLs for the four supported Providers and rejects every other scheme, hostname, port, credential-bearing URL, fragment, query shape, format, or URL length outside the documented Provider policy.

**Consequences (testable):**

- A URL longer than 2,048 characters is rejected atomically before an upstream request.
- The Calculator submits the Provider policy derived from its Resolved Share, but the Import Proxy independently recalculates the permitted hostname and URL shape from `providerId` and rejects a free-form or mismatched policy. The Provider Registry remains the authoritative policy source; compatibility tests prevent drift.
- The proxy does not use DNS resolution or an IP allowlist as a substitute for exact hostname policy.

#### FR-5: Attested Redirect Chain

The Import Proxy follows redirects only under the Redirect Policy of the identified Provider, revalidates every redirect destination, and returns a machine-readable attestation of the accepted Redirect Chain and final URL with Bounded HTML. Realizes UJ-1 and UJ-2.

**Consequences (testable):**

- ChatGPT, Claude, and Mistral allow zero redirects; any redirect fails atomically.
- Gemini allows at most one redirect, only to its configured allowlist; an allowed chain succeeds, an off-allowlist destination fails, and a chain beyond one hop fails.
- No response body is returned unless every hop and the final URL have passed the Redirect Policy.
- The browser can distinguish an upstream redirect-policy failure from a generic network or HTTP failure without trusting a caller-provided chain.

### 4.3 Bounded, Safe Response Delivery

**Description:** The Import Proxy returns only a complete, bounded representation suitable for the local Provider extractor. It never relays a general upstream response and never returns partial HTML. Realizes UJ-1 and UJ-2.

#### FR-6: Response admission and bounds

The Import Proxy accepts an upstream response only if its status, content type, decoded byte count, total elapsed time, and redirect count are within the current Provider policy. Conversation event and JSON-depth limits are local-extractor concerns; the Worker does not parse conversation payloads.

**Consequences (testable):**

- Content-Length is checked when present and streamed bytes are counted when absent; an oversized body is cancelled best-effort and fails without waiting for cancellation.
- A total-timeout failure occurs even when an upstream fetch or body stream ignores cancellation.
- A non-HTML, malformed, HTTP-error, network-error, timeout, size, or policy failure produces a typed error and no partial HTML.
- Decoded HTML is limited to 2 MB and total upstream time to 10 seconds. The local extractor accepts at most three normalized text events; proxy extraction-work and JSON-depth limits are not applicable because the Worker only relays bounded HTML.

#### FR-7: Sanitized response surface

The Import Proxy returns only the data the Calculator needs to process Bounded HTML and diagnose the import.

**Consequences (testable):**

- It returns Bounded HTML, a restricted content type, typed status/error information, and Redirect Chain attestation only.
- It never relays `Set-Cookie`, hop-by-hop headers, or upstream authorization/challenge headers to the Calculator.
- It does not cache any response (TTL 0), including private/authenticated responses, responses carrying `Set-Cookie`, non-HTML responses, or failures.

### 4.4 Calculator Integration and User Transparency

**Description:** The Calculator preserves its local import guarantees and makes the network boundary understandable. Extractors remain local and Provider-specific; the Worker neither parses a conversation nor invents missing content.

#### FR-8: Local, atomic import handling

The Calculator sends Bounded HTML only to the local extractor associated with the attested Provider, preserving textual message order and keeping the import atomic.

**Consequences (testable):**

- No response success is committed unless the local result contains at least one user or assistant text event.
- Inaccessible Content becomes an explicit preview warning; it is neither silently dropped nor interpreted as text.
- A provider format change, overly deep payload, format failure, or any proxy failure affects only that import, preserves existing blocks/calculations, and leaves manual import available.

#### FR-9: Accurate disclosure and help

The Calculator documents the remote import boundary per Provider before consent.

**Consequences (testable):**

- Help names the supported URL format, known limits and Redirect Policy, Worker as the third party, possible URL/IP/user-agent/metadata exposure, and manual alternative.
- Help states that the Worker receives the public share URL and that no Calculator session content is intentionally sent; it does not promise that an upstream Provider or third party cannot process the shared page/content.
- A Worker outage or configuration error is described as potentially common to all Providers, not as isolated Provider failure.

### 4.5 Verification and Operations

**Description:** The product must be demonstrably safer than the previous proxy integration, not merely unit-tested against mocks.

#### FR-10: Integration verification matrix

The team maintains automated integration tests against controlled Worker upstream fixtures and a compatibility-validation procedure against representative public shares for every Provider.

**Consequences (testable):**

- The matrix covers success, no-consent/refusal, cancellation, URL and Provider change, stale/used consent, configuration failure, network/HTTP/timeout/size/format failures, and no local-data egress for all four Providers.
- Gemini tests separately prove the permitted redirect, off-allowlist redirect, and excessive-chain cases through the Worker; ChatGPT, Claude, and Mistral prove redirect rejection.
- Tests include valid-but-over-2,048-character Mistral and Gemini URLs, no-Content-Length oversized streams, deep JSON rejection, inaccessible-content preview warnings, and atomic-state preservation.
- Production readiness requires controlled Worker tests plus representative-public-share compatibility results; HTML fixtures alone are insufficient.

#### FR-11: Abuse resistance and observability

The Import Proxy protects its limited capacity without collecting Calculator content or creating a remote conversation archive.

**Consequences (testable):**

- Rate limits return a typed 429 response at 10 requests per minute per IP, with an approximate 60 requests per hour guard. These are abuse controls rather than strict global quotas.
- The deployment uses Cloudflare Workers logs only: ephemeral native retention of a few days, no Analytics Engine, no third-party storage, and no custom application log that retains an IP address and target URL together. Dashboard access is limited to Felix's personal Cloudflare account; Cloudflare native error-rate and request-volume thresholds are sufficient for this low-volume service.

## 5. Cross-Cutting NFRs

- **Security:** Fail closed. An invalid request, policy, redirect, or response must cause no upstream content delivery and no Calculator state mutation. The service must resist SSRF through strict HTTPS and hostname allowlists, manual redirect handling, and no forwarded credentials.
- **Privacy:** Remote import is the only exception to the Calculator's default browser-only/session-memory processing. No analytics or remote content journal is enabled by default.
- **Reliability:** Every terminal response is typed and deterministic enough for the Calculator to preserve atomicity and manual fallback. A common Worker/configuration failure is acknowledged as a shared dependency risk.
- **Performance:** The Worker enforces a 10-second total duration and 2 MB decoded-response limit while reading upstream responses. It targets the Cloudflare Free plan's 10 ms CPU budget by streaming HTML without server-side parsing.
- **Compatibility:** Provider policy is derived from the Resolved Share and revalidated from `providerId` by the Worker. An incompatible or mismatched policy causes a preflight/configuration failure, never a weakened import.

## 6. Non-Goals (Explicit)

- A generic CORS, browsing, scraping, API, or file-download proxy.
- Importing authenticated, private, account-bound, or non-public conversations.
- Server-side conversation extraction, tokenization, calculation, storage, analytics, or history.
- Forwarding browser cookies, user credentials, API keys, Calculator data, or arbitrary request headers upstream.
- Guaranteeing that any Provider's unannounced HTML format remains parseable.

## 7. MVP Scope

### 7.1 In Scope

- Cloudflare Worker deployment replacing corsproxy.io for the Calculator's public-share import.
- Closed policy enforcement for ChatGPT, Claude, Mistral, and Gemini.
- Verifiable per-hop redirect enforcement, including Gemini's one permitted allowlisted redirect.
- Bounded HTML retrieval, typed atomic failures, CORS origin restriction, minimal telemetry, rate limiting, and integration test matrix.
- Calculator updates needed for the new contract, accurate disclosure, and explicit Inaccessible Content warnings.

### 7.2 Out of Scope for MVP

- Supporting other chatbot providers or arbitrary websites.
- Login-based imports, subscriptions, CAPTCHA bypass, or Provider API integrations.
- Caching; the Worker operates with TTL 0.
- Multi-region high-availability SLA, paid plan selection, or strict global rate accounting.

## 8. Success Metrics

**Primary**

- **SM-1:** All four Providers pass the controlled end-to-end import matrix, including the three Gemini redirect outcomes, with no unverified redirect response accepted. Validates FR-4, FR-5, FR-10.
- **SM-2:** In automated negative-path coverage, 100% of consent, policy, response-bound, and upstream failures leave Calculator session state unchanged and offer manual import. Validates FR-3, FR-6, FR-8, FR-10.

**Secondary**

- **SM-3:** Every successful upstream request has an auditable policy version, Provider, final URL, and compliant Redirect Chain without recording HTML. Validates FR-5, FR-11.

**Counter-metrics**

- **SM-C1:** Do not optimize import-success rate by broadening URL/redirect allowlists or weakening size/time/consent controls. Counterbalances SM-1.
- **SM-C2:** Do not optimize diagnostics by storing shared HTML or Calculator data. Counterbalances SM-3.

## 9. Open Questions

1. The Provider Registry must supply the exact canonical host/query rules and Gemini redirect allowlist as versioned test fixtures for the Worker compatibility suite.

## 10. Assumptions Index

No unconfirmed product assumptions remain. The sole open integration input is tracked in §9.
