import { looksLikeCookieJar, parseCookieString, sessionTokenFromCookies } from "./session";
import type { ClientOptions } from "./types";

export function extractSessionToken(request: Request): string | undefined {
  const cookies = extraCookiesFromRequest(request);
  const fromJar = sessionTokenFromCookies(cookies);
  if (fromJar) {
    return fromJar;
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (looksLikeCookieJar(token)) {
      return sessionTokenFromCookies(parseCookieString(token));
    }
    if (token && token !== process.env.PERPLEXITY_API_KEY) {
      return token;
    }
    if (token && !process.env.PERPLEXITY_SESSION_TOKEN) {
      return token;
    }
  }

  const headerToken = request.headers.get("x-perplexity-session");
  if (headerToken?.trim()) {
    if (looksLikeCookieJar(headerToken)) {
      return sessionTokenFromCookies(parseCookieString(headerToken));
    }
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
    const parsed = parseCookieString(raw);
    return Object.keys(parsed).length ? parsed : undefined;
  }
}

export function extraCookiesFromRequest(request: Request): Record<string, string> {
  const fromHeader = request.headers.get("x-perplexity-cookies");
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const candidates = [fromHeader, looksLikeCookieJar(bearer) ? bearer : "", process.env.PERPLEXITY_COOKIES];

  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }
    if (candidate.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(candidate) as Record<string, string>;
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch {
        // Fall through to cookie-string parsing.
      }
    }
    const parsed = parseCookieString(candidate);
    if (Object.keys(parsed).length) {
      return parsed;
    }
  }

  return extraCookiesFromEnv() ?? {};
}

export function clientOptionsFromRequest(request: Request): ClientOptions {
  const extraCookies = extraCookiesFromRequest(request);
  return {
    sessionToken: extractSessionToken(request),
    officialApiKey: extractOfficialKey(request),
    extraCookies: Object.keys(extraCookies).length ? extraCookies : undefined,
  };
}
