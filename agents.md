# Agent Instructions

## Purpose

This repository contains planning artifacts for a self-hosted Cloudflare Worker that replaces a third-party proxy in the calculator's public conversation-import flow.

## Non-negotiable safety invariants

- Treat the Worker as a narrow import boundary, never as a general-purpose proxy.
- Allow only approved public share URLs for ChatGPT, Claude, Mistral, and Gemini through a closed, versioned policy.
- Never forward Calculator session data, blocks, files, calculations, cookies, authorization, API keys, or caller-selected headers to an upstream Provider.
- Enforce HTTPS, exact hostname rules, URL canonicalization, a 2,048-character URL limit, a 10-second total time limit, a 2 MB decoded-byte limit, and redirect count. Fail closed and return no partial HTML. The Worker does not parse HTML/JSON; the local extractor accepts at most three normalized text events.
- Follow redirects manually and validate every hop and final URL against the Provider Redirect Policy. ChatGPT, Claude, and Mistral permit zero redirects; Gemini permits only one allowlisted redirect.
- Preserve request-specific, one-use user consent in the Calculator. Any cancellation, identity/policy/configuration change, or invalid consent means no network request and no local mutation.
- At consent, obtain an ephemeral Turnstile token and verify it server-side in the Worker before upstream fetch. Combine this with configured-origin allowlists and IP rate limits (10/minute, approximately 60/hour); never treat it as authorization for arbitrary client policy.
- Keep extraction local and Provider-specific. Preserve text order; surface inaccessible non-text content as a warning without inventing text.
- Every failure is typed, atomic, preserves existing Calculator state, and leaves manual import available.

## Engineering expectations

- Use separate Cloudflare environment variables for allowed origins (`http://localhost:5173` in development and `https://felixmortas.com` in production), GET-only behavior, no credential forwarding, sanitized response headers, and no cache (TTL 0).
- Use the Cloudflare Free plan and native ephemeral logs only; do not add Analytics Engine, third-party observability, or persistent custom logs containing IP addresses and target URLs.
- Do not treat browser redirect settings or an upstream proxy's undocumented behavior as redirect proof.
- Test against a deployed or controlled Worker upstream, not mocks alone. Cover all four Providers, consent rejection, stale state, redirects, limits, no local-data egress, atomic failures, inaccessible-content rendering, long valid URLs, and confirmation that the Worker does not parse conversation JSON.
- Keep policy values explicit and versioned. Do not invent production thresholds without recording the decision and test evidence.

## Documentation

- Update the PRD and technical addendum when changing a requirement or design decision.
- Keep user-facing disclosures accurate: a public share URL, IP/user-agent, and related metadata may be exposed; never promise that a Provider or proxy cannot process the shared page.
