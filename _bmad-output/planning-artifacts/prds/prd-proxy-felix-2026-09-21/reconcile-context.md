# Input Reconciliation — Epic 5 Context

## Inputs reviewed

- `context/epic-5-retro-09-21-2026.md`
- `context/prd_extract.md`
- `context/spec-5-1-consentir-a-l-import-distant-multi-fournisseur-v2.md`
- `context/spec-5-2-recuperer-un-partage-par-une-passerelle-tiers-bornee-multi-fournisseur-v2.md`
- `context/spec-5-3-documenter-et-verifier-la-frontiere-d-import-distant-multi-fournisseur-v2.md`
- `context/spec-5-4-ajouter-les-adaptateurs-de-partage-multi-fournisseur.md`

## Reconciled into the PRD

- The closed four-provider registry, explicit one-use consent, no-local-data egress, bounded remote response, local extraction, typed atomic failures, and manual fallback are captured in FR-1 through FR-11.
- The retrospective's rejected-epic cause is captured by FR-5: the Worker must validate and attest every redirect hop and final URL. Gemini's permitted one-hop allowlisted case is explicitly testable; ChatGPT, Claude, and Mistral permit zero redirects.
- The retrospective remediation actions are included in FR-8 and FR-10: explicit inaccessible-content preview warning, valid over-length Mistral/Gemini URL tests, bounded deep-payload processing, and controlled Worker integration tests.
- The explicit 2,048-character maximum URL is retained in FR-4.
- Disclosure obligations and the common Worker outage/configuration dependency are captured in FR-9 and the cross-cutting NFRs.

## Decisions supplied after initial draft

- Decoded HTML is limited to 2 MB, total upstream time to 10 seconds, local extraction to three events, cache TTL to 0, and IP rate limiting to 10/minute with an approximate 60/hour guard.
- Cloudflare environments use separate approved-origin variables: `http://localhost:5173` in development and `https://felixmortas.com` in production.
- An ephemeral Turnstile token is verified by the Worker before fetch; the Worker recomputes expected URL policy from `providerId` rather than trusting free-form policy supplied by the browser.
- The deployment uses the Cloudflare Free plan, native ephemeral logs, dashboard-only access, and native Cloudflare alert thresholds.
- Exact Provider host/query rules and the Gemini redirect allowlist remain Registry-owned compatibility fixtures, not values invented in this proxy PRD.
