import { describe, expect, it } from 'vitest';
import { canonicalizeShareUrl, validateRedirect } from '../src/policy';

const uuid = '123e4567-e89b-42d3-a456-426614174000';

describe('closed URL policy', () => {
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
    `https://share.gemini.google/too-short`,
  ])('rejects unsafe URL shape %s', url => expect(() => canonicalizeShareUrl(url)).toThrow('policy'));

  it('allows exactly the Gemini redirect fixture', () => {
    const start = canonicalizeShareUrl('https://share.gemini.google/AbcD1234EfGh');
    const next = validateRedirect(start, `https://gemini.google.com/share/ZyxW9876VutS?skid=${uuid}`);
    expect(next.stage).toBe('gemini-redirect');
    expect(() => validateRedirect(next, `https://gemini.google.com/share/ZyxW9876VutS?skid=${uuid}`)).toThrow('redirect-disallowed');
  });

  it('rejects every noncanonical redirect target', () => {
    const start = canonicalizeShareUrl('https://share.gemini.google/AbcD1234EfGh');
    expect(() => validateRedirect(start, `https://gemini.google.com/share/ZyxW9876VutS?x=1&skid=${uuid}`)).toThrow('redirect-disallowed');
    expect(() => validateRedirect(start, 'https://evil.example/')).toThrow('redirect-disallowed');
  });
});
