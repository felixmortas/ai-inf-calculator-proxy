---
title: Accepted Scope Change — Public-Share HTML Relay MVP
status: accepted
created: 2026-09-21
accepted: 2026-09-21
---

# Accepted Scope Change

Felix approved replacing the detailed import protocol with a small Cloudflare Worker that validates one supported public-share URL, fetches bounded HTML, and returns final HTML or a typed failure.

The change removes client-supplied policy material, response redirect-chain attestation, separate architecture/backlog work, and verbose PRD structure. It keeps the repository safety boundary: closed versioned URL policies, Origin and Turnstile checks, GET-only no-credential fetches, bounded complete HTML, no cache, rate limits, local extraction, atomic failures, and manual fallback.

Redirects are not opened globally. Each hop is manually validated: ChatGPT, Claude, and Mistral permit zero redirects; Gemini permits one destination only: `https://gemini.google.com/share/<id>?skid=<uuid>`. Initial formats are recorded in the PRD and must be versioned in Worker fixtures.

Updated artifacts: `prd.md`, `addendum.md`, `reconcile-context.md`, and `review-rubric.md` in `prds/prd-proxy-felix-2026-09-21/`.
