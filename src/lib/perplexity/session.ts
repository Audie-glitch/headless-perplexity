import { API_BASE_URL, BROWSER_HEADERS, SESSION_COOKIE_NAMES } from "./constants";
import type { AccountTier, SessionInfo } from "./types";

export function buildCookieHeader(
  sessionToken?: string,
  extraCookies?: Record<string, string>,
): string | undefined {
  const cookies: string[] = [];

  if (sessionToken) {
    for (const name of SESSION_COOKIE_NAMES) {
      cookies.push(`${name}=${sessionToken}`);
    }
  }

  if (extraCookies) {
    for (const [name, value] of Object.entries(extraCookies)) {
      if (value) {
        cookies.push(`${name}=${value}`);
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
