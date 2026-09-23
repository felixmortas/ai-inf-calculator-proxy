export interface Env {
  ALLOWED_ORIGIN: string;
  ALLOWED_LOCAL_ORIGIN?: string;
  RATE_LIMITER: RateLimit;
}

export interface ImportRequest {
  shareUrl: string;
}

export type Provider = 'chatgpt' | 'claude' | 'mistral' | 'gemini';

export interface CanonicalUrl {
  provider: Provider;
  url: URL;
  id: string;
}
