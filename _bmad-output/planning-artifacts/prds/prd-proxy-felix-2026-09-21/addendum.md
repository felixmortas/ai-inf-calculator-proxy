# Technical Addendum — MVP Relay

## One endpoint, one algorithm

The Worker exposes one Calculator-only endpoint. It validates Origin and the Turnstile token, canonicalizes the supplied share URL against its local versioned policy, then fetches with `redirect: "manual"`.

For every redirect response, it resolves `Location` relative to the current URL, canonicalizes it, and checks the selected provider policy before fetching again. ChatGPT, Claude, and Mistral allow no redirect. Gemini allows one exact destination shape: `https://gemini.google.com/share/<id>?skid=<uuid>`. No body is exposed until the final response passes.

For the final response, the Worker checks the HTML type, streams and counts decoded bytes to 2 MB, and applies a 10-second wall-clock deadline. It returns sanitized HTML or a typed error only. It uses no credentials, cache, upstream response-header relay, parsing, or persistent application logs.

## Configuration and tests

- Separate allowed-origin environment variables: development `http://localhost:5173`; production `https://felixmortas.com`.
- Versioned in-Worker policy: initial formats are `chatgpt.com/share/<id>`, `claude.ai/share/<id>`, `chat.mistral.ai/chat/<id>`, and `share.gemini.google/<id>`; Gemini's sole redirect target is `gemini.google.com/share/<id>?skid=<uuid>`. The Worker must use the same `<id>` canonicalization as the Calculator adapters.
- Cloudflare Free plan, native ephemeral logs, and IP throttling at 10/minute and approximately 60/hour.
- Test with controlled or deployed upstreams: each provider's accepted URL, Gemini's allowed/rejected/excessive redirect cases, other-provider redirect rejection, bounds, no data egress, and atomic errors.
