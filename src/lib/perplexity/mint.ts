import { API_BASE_URL, BROWSER_HEADERS } from "./constants";
import { MintError, ValidationError } from "./errors";
import { parseCookieString, sessionTokenFromCookies } from "./session";
import { createChromeFetch } from "./transport";

const EMAILNATOR_ORIGIN = "https://www.emailnator.com";
const CALLBACK_HOST = "https://www.perplexity.ai/api/auth/callback/email";
const QUOTED_SIGNIN_LINK =
  /"(https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?[^"]+)"/i;
const BARE_SIGNIN_LINK =
  /https:\/\/www\.perplexity\.ai\/api\/auth\/callback\/email\?[^\s"'<>]+/i;

export interface MintResult {
  email: string;
  cookies: string;
  sessionToken?: string;
}

export interface MintOptions {
  emailnatorCookies: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  pollMs?: number;
  pollTimeoutMs?: number;
}

export interface ResolveEmailnatorCookiesInput {
  cookies?: string;
  request?: Request;
}

interface CookieJar {
  [name: string]: string;
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractSignInLink(emailBody: string): string | null {
  const decoded = decodeHtmlEntities(emailBody);
  const quoted = decoded.match(QUOTED_SIGNIN_LINK);
  if (quoted?.[1]) {
    return quoted[1];
  }
  const bare = decoded.match(BARE_SIGNIN_LINK);
  return bare?.[0] ?? null;
}

export function resolveEmailnatorCookies(input: ResolveEmailnatorCookiesInput = {}): string | undefined {
  const candidates = [
    input.cookies,
    input.request?.headers.get("x-emailnator-cookies"),
    process.env.EMAILNATOR_COOKIES,
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function emailnatorCookieHeader(raw: string): { header: string; xsrf: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ValidationError("Emailnator cookies are required to mint an account");
  }

  let cookies: Record<string, string>;
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      cookies = {};
      for (const [name, value] of Object.entries(parsed)) {
        if (typeof value === "string" && value) {
          cookies[name] = value;
        }
      }
    } catch {
      throw new ValidationError("Emailnator cookies JSON is invalid");
    }
  } else {
    cookies = parseCookieString(trimmed);
  }

  const xsrf = decodeURIComponent(cookies["XSRF-TOKEN"] ?? "");
  if (!xsrf) {
    throw new ValidationError(
      "Emailnator cookies must include XSRF-TOKEN. Open emailnator.com, pass Cloudflare, and copy the whole Cookie header.",
    );
  }

  const header = Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  return { header, xsrf };
}

export async function completeMintFromLink(
  callbackUrl: string,
  fetchImpl: typeof fetch = createChromeFetch(),
): Promise<MintResult> {
  const url = extractSignInLink(callbackUrl) ?? callbackUrl.trim();
  if (!url.startsWith(CALLBACK_HOST)) {
    throw new ValidationError("Not a Perplexity email callback URL");
  }

  const jar: CookieJar = {};
  const callback = await followAuthRedirects(fetchImpl, url, jar);
  const cookies = serializeJar(jar);
  const sessionToken = sessionTokenFromCookies(jar);
  if (!sessionToken) {
    throw new MintError(`Callback finished without a session cookie (HTTP ${callback.status})`);
  }

  return {
    email: emailFromCallback(url),
    cookies,
    sessionToken,
  };
}

export async function mintAccount(options: MintOptions): Promise<MintResult> {
  const emailnatorCookies = options.emailnatorCookies.trim();
  if (!emailnatorCookies) {
    throw new ValidationError("Emailnator cookies are required to mint an account");
  }

  const fetchImpl = options.fetchImpl ?? createChromeFetch();
  const maxAttempts = options.maxAttempts ?? 3;
  const inbox = await createInbox(emailnatorCookies, fetchImpl);
  const jar: CookieJar = {};

  await request(fetchImpl, `${API_BASE_URL}/api/auth/session`, { method: "GET" }, jar);

  let lastError = "Sign-in email was not received";
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const csrf = await readCsrf(fetchImpl, jar);
    if (!csrf) {
      lastError = "Perplexity did not return a CSRF token";
      continue;
    }

    const signed = await request(
      fetchImpl,
      `${API_BASE_URL}/api/auth/signin/email`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: inbox.email,
          csrfToken: csrf,
          callbackUrl: `${API_BASE_URL}/`,
          json: "true",
        }).toString(),
      },
      jar,
    );

    if (signed.status >= 400) {
      lastError = cloudflareHint(
        `Perplexity sign-in returned ${signed.status}`,
        signed.status,
        signed.body,
      );
      continue;
    }

    const link = await inbox.waitForSignInLink(options.pollMs ?? 4000, options.pollTimeoutMs ?? 24_000);
    if (!link) {
      lastError = "No Perplexity sign-in email arrived in the disposable inbox";
      continue;
    }

    const callback = await followAuthRedirects(fetchImpl, link, jar);
    const cookies = serializeJar(jar);
    const sessionToken = sessionTokenFromCookies(jar);
    if (!sessionToken) {
      lastError = `Callback finished without a session cookie (HTTP ${callback.status})`;
      continue;
    }

    return { email: inbox.email, cookies, sessionToken };
  }

  throw new MintError(lastError);
}

async function readCsrf(fetchImpl: typeof fetch, jar: CookieJar): Promise<string> {
  const response = await request(fetchImpl, `${API_BASE_URL}/api/auth/csrf`, { method: "GET" }, jar);
  try {
    const payload = JSON.parse(response.body) as { csrfToken?: string };
    if (payload.csrfToken) {
      return payload.csrfToken;
    }
  } catch {
    // Fall through to the cookie NextAuth sets.
  }

  const raw =
    jar["next-auth.csrf-token"] ??
    jar["__Host-next-auth.csrf-token"] ??
    jar["__Secure-next-auth.csrf-token"] ??
    "";
  return decodeURIComponent(raw).split("|")[0] ?? "";
}

async function createInbox(cookieHeader: string, fetchImpl: typeof fetch) {
  const { header, xsrf } = emailnatorCookieHeader(cookieHeader);

  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    origin: EMAILNATOR_ORIGIN,
    referer: `${EMAILNATOR_ORIGIN}/`,
    cookie: header,
    "x-xsrf-token": xsrf,
    "x-requested-with": "XMLHttpRequest",
    "user-agent": BROWSER_HEADERS["user-agent"],
  };

  const email = await generateAddress(fetchImpl, headers);
  const ads = new Set<string>();
  const list = await fetchImpl(`${EMAILNATOR_ORIGIN}/message-list`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email }),
  });
  if (list.ok) {
    const payload = (await list.json().catch(() => null)) as { messageData?: Array<{ messageID?: string }> } | null;
    for (const message of payload?.messageData ?? []) {
      if (message.messageID) {
        ads.add(message.messageID);
      }
    }
  }

  return {
    email,
    async waitForSignInLink(pollMs: number, timeoutMs: number): Promise<string | null> {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        const inbox = await fetchImpl(`${EMAILNATOR_ORIGIN}/message-list`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email }),
        });
        if (inbox.ok) {
          const payload = (await inbox.json().catch(() => null)) as {
            messageData?: Array<{ messageID?: string; subject?: string }>;
          } | null;
          const match = (payload?.messageData ?? []).find(
            (message) =>
              message.messageID &&
              !ads.has(message.messageID) &&
              /perplexity/i.test(message.subject ?? ""),
          );
          if (match?.messageID) {
            const opened = await fetchImpl(`${EMAILNATOR_ORIGIN}/message-list`, {
              method: "POST",
              headers,
              body: JSON.stringify({ email, messageID: match.messageID }),
            });
            return extractSignInLinkFromMessage(await opened.text());
          }
        }
        await delay(pollMs);
      }
      return null;
    },
  };
}

async function generateAddress(
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
): Promise<string> {
  let lastError = "Emailnator did not return an address";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generate = await fetchImpl(`${EMAILNATOR_ORIGIN}/generate-email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: ["googleMail"] }),
    });
    const body = await generate.text();
    if (!generate.ok) {
      lastError = cloudflareHint(`Emailnator rejected email generation (${generate.status})`, generate.status, body);
      await delay(750);
      continue;
    }

    try {
      const generated = JSON.parse(body) as { email?: string[] };
      const email = generated.email?.[0];
      if (email) {
        return email;
      }
    } catch {
      lastError = cloudflareHint("Emailnator returned a non-JSON generate-email response", generate.status, body);
    }

    await delay(750);
  }

  throw new MintError(lastError);
}

function extractSignInLinkFromMessage(raw: string): string | null {
  const direct = extractSignInLink(raw);
  if (direct) {
    return direct;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return extractSignInLink(typeof parsed === "string" ? parsed : JSON.stringify(parsed));
  } catch {
    return null;
  }
}

function emailFromCallback(url: string): string {
  try {
    return new URL(url).searchParams.get("email") ?? "unknown";
  } catch {
    return "unknown";
  }
}

function cloudflareHint(message: string, status: number, body: string): string {
  if (status === 403 || status === 503 || /just a moment|cf-browser-verification|challenge-platform/i.test(body)) {
    return `${message}. Cloudflare blocked this IP. Use a residential network or paste a cookie minted in a browser on this same address.`;
  }
  return message;
}

async function followAuthRedirects(
  fetchImpl: typeof fetch,
  startUrl: string,
  jar: CookieJar,
): Promise<{ status: number }> {
  let url = startUrl;
  let status = 0;

  for (let hop = 0; hop < 8; hop += 1) {
    const response = await request(fetchImpl, url, { method: "GET", redirect: "manual" }, jar);
    status = response.status;
    if (status < 300 || status >= 400 || !response.location) {
      return { status };
    }
    url = new URL(response.location, url).toString();
  }

  return { status };
}

async function request(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  jar: CookieJar,
): Promise<{ status: number; body: string; location?: string }> {
  const cookie = serializeJar(jar);
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      accept: "application/json, text/html, */*",
      origin: API_BASE_URL,
      referer: `${API_BASE_URL}/`,
      "user-agent": BROWSER_HEADERS["user-agent"],
      ...(cookie ? { cookie } : {}),
      ...(init.headers ?? {}),
    },
    redirect: init.redirect ?? "manual",
  });
  mergeSetCookies(jar, response);
  return {
    status: response.status,
    body: await response.text(),
    location: response.headers.get("location") ?? undefined,
  };
}

export function mergeSetCookies(jar: CookieJar, response: Response) {
  const cookies =
    typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const line of cookies) {
    const part = line.split(";", 1)[0];
    const separator = part.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    jar[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
  }
}

function serializeJar(jar: CookieJar): string {
  return Object.entries(jar)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
