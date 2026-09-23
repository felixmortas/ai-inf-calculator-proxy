/** Versioned closed allow-list. Changing this is a public policy change. */
export const policyVersion = '2026-09-23.2' as const;
export const maxUrlLength = 2_048;
export const providerFixtures = Object.freeze({
  chatgpt: { host: 'chatgpt.com', pathPrefix: '/share/', enabled: false },
  claude: { host: 'claude.ai', pathPrefix: '/share/', enabled: true },
  mistral: { host: 'chat.mistral.ai', pathPrefix: '/chat/', enabled: true },
  gemini: { host: 'share.gemini.google', pathPrefix: '/', enabled: true },
});
