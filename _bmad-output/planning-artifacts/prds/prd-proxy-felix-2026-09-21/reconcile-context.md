# Reconciliation — MVP Relay

On 2026-09-21, the product scope was reduced from a detailed import protocol to a single bounded HTML-relay endpoint.

Retained from Epic 5: the closed four-provider registry, request-specific consent and Turnstile verification, no Calculator-data egress, manual redirect validation, response bounds, local extraction, typed atomic failures, accurate disclosure, and manual fallback.

Removed as unnecessary MVP ceremony: browser-supplied policy material, response redirect-chain attestation, server-side extraction concerns, extensive PRD taxonomy, and a separate architecture/backlog phase.

The supplied fixtures are: `chatgpt.com/share/<id>`, `claude.ai/share/<id>`, `chat.mistral.ai/chat/<id>`, and `share.gemini.google/<id>`. Gemini alone may redirect once to `gemini.google.com/share/<id>?skid=<uuid>`; the other providers allow no redirect. The Worker must share the Calculator adapters' `<id>` canonicalization.
