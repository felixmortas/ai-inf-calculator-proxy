export interface Env {
  ALLOWED_ORIGIN: string;
  TURNSTILE_EXPECTED_HOSTNAME: string;
  TURNSTILE_SECRET_KEY: string;
  RATE_LIMIT_HMAC_KEY: string;
  RATE_LIMITER: DurableObjectNamespace;
}

export interface ImportRequest {
  shareUrl: string;
  turnstileToken: string;
}

export type Provider = 'chatgpt' | 'claude' | 'mistral' | 'gemini';

export interface CanonicalUrl {
  provider: Provider;
  url: URL;
  id: string;
  stage: 'initial' | 'gemini-redirect';
}

export interface RateLimitResult { allowed: boolean }
