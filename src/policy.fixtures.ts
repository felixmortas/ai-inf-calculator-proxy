/** Versioned closed allow-list. Changing this is a public policy change. */
export const policyVersion = '2026-09-21.1' as const;
export const maxUrlLength = 2_048;
export const maxRedirects = 1;
export const providerFixtures = Object.freeze({
  chatgpt: { host: 'chatgpt.com', pathPrefix: '/share/' },
  claude: { host: 'claude.ai', pathPrefix: '/share/' },
  mistral: { host: 'chat.mistral.ai', pathPrefix: '/chat/' },
  gemini: { host: 'share.gemini.google', pathPrefix: '/' },
  geminiRedirect: { host: 'gemini.google.com', pathPrefix: '/share/' },
});
