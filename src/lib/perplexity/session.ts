import { API_BASE_URL, BROWSER_HEADERS, SESSION_COOKIE_NAMES } from "./constants";
import type { AccountTier, SessionInfo } from "./types";

export function parseCookieString(raw?: string): Record<string, string> {
  if (!raw?.trim()) {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (name && value) {
      cookies[name] = value;
    }
  }
  return cookies;
}

export function looksLikeCookieJar(value?: string): boolean {
  if (!value) {
    return false;
  }
  return value.includes(";") && value.includes("=");
}

export function sessionTokenFromCookies(cookies: Record<string, string>): string | undefined {
  for (const name of SESSION_COOKIE_NAMES) {
    if (cookies[name]) {
      return cookies[name];
    }
  }
  return undefined;
}

export function buildCookieHeader(
  sessionToken?: string,
  extraCookies?: Record<string, string>,
): string | undefined {
  const cookies: string[] = [];
  const seen = new Set<string>();

  if (extraCookies) {
    for (const [name, value] of Object.entries(extraCookies)) {
      if (!value) {
        continue;
      }
      cookies.push(`${name}=${value}`);
      seen.add(name);
    }
  }

  if (sessionToken) {
    for (const name of SESSION_COOKIE_NAMES) {
      if (!seen.has(name)) {
        cookies.push(`${name}=${sessionToken}`);
      }
    }
  }

  return cookies.length ? cookies.join("; ") : undefined;
}

export function requestHeaders(cookieHeader?: string, extra?: Record<string, string>): HeadersInit {
  return {
    ...BROWSER_HEADERS,
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
    ...extra,
  };
}

export function parseAccountTier(raw: unknown): AccountTier {
  if (!raw || typeof raw !== "object") {
    return "unknown";
  }

  const record = raw as Record<string, unknown>;
  const user = (record.user ?? record) as Record<string, unknown>;
  const candidates = [
    user.subscription_tier,
    user.subscriptionTier,
    record.subscription_tier,
    record.subscriptionStatus,
  ];

  for (const candidate of candidates) {
    const value = String(candidate ?? "").toLowerCase();
    if (value.includes("max")) {
      return "max";
    }
    if (value.includes("pro")) {
      return "pro";
    }
    if (value.includes("free") || value.includes("basic")) {
      return "free";
    }
  }

  if (record.user) {
    return "free";
  }

  return "unknown";
}

export function parseSessionPayload(raw: unknown): SessionInfo {
  if (!raw || typeof raw === "string" || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    return { authenticated: false, accountTier: "unknown", raw };
  }

  const record = raw as Record<string, unknown>;
  const user = (record.user ?? null) as Record<string, unknown> | null;
  const email = typeof user?.email === "string" ? user.email : undefined;

  return {
    authenticated: Boolean(user),
    email,
    accountTier: parseAccountTier(raw),
    raw,
  };
}

export function webUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}
