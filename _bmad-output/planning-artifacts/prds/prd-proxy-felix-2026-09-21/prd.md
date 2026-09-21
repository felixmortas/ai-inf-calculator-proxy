---
title: MVP PRD — Public-Share HTML Relay
status: final
created: 2026-09-21
updated: 2026-09-21
---

# Public-Share HTML Relay

## Goal

Replace the third-party import proxy with one self-hosted Cloudflare Worker. The Calculator sends a supported public conversation-share URL; the Worker returns the complete final HTML or a typed error. The Worker is an import boundary, never a general-purpose proxy.

## MVP flow

`Calculator → validate supported share URL → bounded Worker fetch → final HTML or typed failure → local provider extractor`

The Calculator keeps consent, local extraction, preview, and all state changes. A failed import changes no Calculator state and manual paste remains available.

## Requirements

### FR-1 — Narrow request boundary

- Accept requests only from the configured Calculator origin: `http://localhost:5173` in development and `https://felixmortas.com` in production.
- Expose one retrieval route. Upstream requests are HTTPS GET only.
- Never forward Calculator data, cookies, authorization, API keys, caller-chosen headers, or caller-chosen fetch options.
- The Calculator obtains an ephemeral Turnstile token at consent; the Worker verifies it before fetching. Consent is one-use and invalid after cancellation or a relevant URL, identity, policy, or configuration change.

### FR-2 — Closed share-URL policy

- Accept only canonical, versioned public-share URL formats for ChatGPT, Claude, Mistral, and Gemini, supplied by the Calculator registry.
- Reject every other scheme, hostname, port, credential-bearing URL, fragment, unsupported query/path shape, or URL longer than 2,048 characters before fetch.
- The initial URL fixtures are: ChatGPT `https://chatgpt.com/share/<id>`; Claude `https://claude.ai/share/<id>`; Mistral `https://chat.mistral.ai/chat/<id>`; and Gemini `https://share.gemini.google/<id>`. Here, `<id>` is accepted only according to the Calculator registry's canonicalizer.

### FR-3 — Manual, closed redirects

- Disable automatic redirects and validate every `Location` before the next request or any body is returned.
- ChatGPT, Claude, and Mistral permit zero redirects. Gemini permits at most one redirect, exactly to `https://gemini.google.com/share/<id>?skid=<uuid>`; no other query parameter, hostname, path, or second redirect is allowed.
- A disallowed or excessive redirect fails atomically. The Worker never follows an arbitrary destination, even when the initial URL belongs to an approved provider.

### FR-4 — Bounded HTML response

- Return only complete HTML with a restricted content type; never return partial HTML or relay upstream cookies/challenge headers.
- Enforce a 10-second total limit, a 2 MB decoded-byte limit, no cache (TTL 0), and typed failures for policy, network, HTTP, timeout, size, or type errors.
- The Worker does not parse HTML, JSON, or conversation content. The local extractor accepts at most three normalized text events and warns about inaccessible non-text content.

### FR-5 — Minimal abuse controls and proof

- Apply IP rate limits of 10/minute and approximately 60/hour, plus the origin and Turnstile checks. These controls do not authorize arbitrary URLs.
- Use Cloudflare Free and native ephemeral logs only; do not store HTML, target URLs, or persistent IP-and-URL records.
- Test controlled/deployed Worker behavior for all four providers, redirects, limits, no local-data egress, typed atomic failures, and manual fallback.

## Non-goals

- Arbitrary web, API, file, authenticated, or private-content fetching.
- Server-side extraction, content storage, analytics, or caching.
- A promise that an upstream provider cannot process a public shared page. The user-facing disclosure must accurately state that the public share URL, IP/user-agent, and related metadata may be exposed.

## Definition of done

All four registry URL policies are present as versioned fixtures. A controlled/deployed Worker returns complete HTML only for compliant requests and rejects every failure without partial HTML or Calculator-state mutation.
