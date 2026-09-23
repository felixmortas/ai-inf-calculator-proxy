import { describe, expect, it } from 'vitest';
import { canonicalizeShareUrl } from '../src/policy';
import { maxUrlLength } from '../src/policy.fixtures';

const uuid = '123e4567-e89b-42d3-a456-426614174000';

describe('closed initial URL policy', () => {
  it.each([
    [`https://chatgpt.com/share/${uuid}`, 'chatgpt'],
    ['https://chatgpt.com/share/6ab14133-ee34-83eb-ab08-d581e785bdbb', 'chatgpt'],
    [`https://claude.ai/share/${uuid}`, 'claude'],
    [`https://chat.mistral.ai/chat/${uuid}`, 'mistral'],
    ['https://share.gemini.google/AbcD1234EfGh', 'gemini'],
  ])('accepts canonical %s', (url, provider) => expect(canonicalizeShareUrl(url).provider).toBe(provider));

  it.each([
    `http://chatgpt.com/share/${uuid}`, `https://chatgpt.com:443/share/${uuid}`,
    `https://user@chatgpt.com/share/${uuid}`, `https://chatgpt.com/share/${uuid}#x`,
    `https://chatgpt.com/share/${uuid}?x=1`, `https://evil.example/share/${uuid}`,
    `https://share.gemini.google/too-short`, `https://chatgpt.com/share/${uuid}/`,
    `https://CHATGPT.com/share/${uuid}`, `https://gemini.google.com/share/AbcD1234EfGh`,
    `https://chatgpt.com/share/${uuid}${'x'.repeat(maxUrlLength)}`,
  ])('rejects unsafe initial URL shape %s', url => expect(() => canonicalizeShareUrl(url)).toThrow('policy'));
});
