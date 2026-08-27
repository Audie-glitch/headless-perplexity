import type { ClientOptions } from "./types";

export function extractSessionToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token && token !== process.env.PERPLEXITY_API_KEY) {
      return token;
    }
    if (token && !process.env.PERPLEXITY_SESSION_TOKEN) {
      return token;
    }
  }

  const headerToken = request.headers.get("x-perplexity-session");
  if (headerToken?.trim()) {
    return headerToken.trim();
  }

  return process.env.PERPLEXITY_SESSION_TOKEN?.trim() || undefined;
}

export function extractOfficialKey(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token && token === process.env.PERPLEXITY_API_KEY) {
      return token;
    }
  }

  const headerKey = request.headers.get("x-perplexity-api-key");
  if (headerKey?.trim()) {
    return headerKey.trim();
  }

  return process.env.PERPLEXITY_API_KEY?.trim() || undefined;
}

export function extraCookiesFromEnv(): Record<string, string> | undefined {
  const raw = process.env.PERPLEXITY_COOKIES;
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed;
  } catch {
    return undefined;
  }
}

export function clientOptionsFromRequest(request: Request): ClientOptions {
  return {
    sessionToken: extractSessionToken(request),
    officialApiKey: extractOfficialKey(request),
    extraCookies: extraCookiesFromEnv(),
  };
}
