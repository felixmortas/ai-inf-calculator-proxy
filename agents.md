# Agent Instructions

## Purpose

This repository contains a self-hosted Cloudflare Worker: a narrow HTML relay used by the Calculator's public conversation-import flow. It replaces a third-party proxy.

## Non-negotiable safety invariants

- The Worker is a narrow import boundary, never a general-purpose proxy.
- Accept only requests matching one of the four closed, versioned URL templates (ChatGPT, Claude, Mistral, Gemini). Reject any other scheme, host, port, credential-bearing URL, fragment, query form, or non-matching path.
- Never forward cookies, credentials, authorization headers, API keys, Calculator data, or caller-selected headers to an upstream provider. Upstream requests are GET-only.
- Enforce: HTTPS only, exact hostname match, URL canonicalization, a URL length limit, a total request timeout, a decoded-byte limit, a single generic redirect limit, and no cache. Fail closed — never return partial HTML.
- Disable automatic redirects. For each hop, canonicalize and revalidate the `Location` against the same closed URL policy before following it. Stop at the generic redirect limit. There is no per-provider redirect behavior.
- Every failure is a typed, atomic error. No partial HTML, no side effects.
- The Worker does not parse, extract, or interpret HTML/JSON content — it returns complete HTML only. Extraction and Calculator-state handling happen entirely outside this repository.
- Consent, session state, and manual-import fallback are the Calculator's responsibility, not the Worker's. This repository has no dependency on them.

## Engineering expectations

- Configure allowed Calculator origins per environment (e.g. `http://localhost:5173` in development, the production origin in production). Reject requests from any other origin.
- Keep GET-only behavior, credential stripping, sanitized response headers, and `Cache-Control: no-store` as fixed, non-configurable behavior.
- Use the Cloudflare Free plan and native ephemeral logs only. Do not add Analytics Engine, third-party observability, or persistent logs containing IP addresses or target URLs.
- Apply basic rate limiting per origin/IP to prevent abuse; exact thresholds are a recorded, versioned decision — not invented ad hoc.
- Do not treat an upstream provider's undocumented redirect behavior as proof of a safe hop. Only a hop matching the closed URL policy is valid.
- Test all four accepted URL templates, rejected URL shapes, valid and invalid redirect targets, all bound limits (URL length, timeout, byte size, redirect count), no forwarded credentials/headers, typed atomic failures, and origin rejection.
- Keep the four URL templates and the generic redirect limit explicit and versioned in code. Do not implement production thresholds that aren't recorded with test evidence.

## Documentation

- Update the PRD and technical addendum whenever a requirement, URL template, or limit changes.
- This repository's disclosures only need to describe what the Worker itself does (validate, fetch, relay). User-facing consent copy (what the Calculator tells the person about IP/user-agent exposure) lives in the Calculator repository, not here.
