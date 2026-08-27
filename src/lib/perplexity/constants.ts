export const API_BASE_URL = "https://www.perplexity.ai";
export const OFFICIAL_API_BASE_URL = "https://api.perplexity.ai";
export const API_VERSION = "2.18";

export const ENDPOINT_ASK = "/rest/sse/perplexity_ask";
export const ENDPOINT_SEARCH_INIT = "/search/new";
export const ENDPOINT_AUTH_SESSION = "/api/auth/session";
export const ENDPOINT_USER_SETTINGS = "/rest/user/settings";

export const SESSION_COOKIE_NAMES = [
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
] as const;

export const DEFAULT_LANGUAGE = "en-US";
export const DEFAULT_TIMEZONE = "America/Los_Angeles";
export const DEFAULT_MODEL_ID = "perplexity/best";

export const BROWSER_HEADERS: Record<string, string> = {
  accept: "text/event-stream, application/json",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  pragma: "no-cache",
  origin: API_BASE_URL,
  referer: `${API_BASE_URL}/`,
  "sec-ch-ua": '"Not;A=Brand";v="24", "Chromium";v="128", "Google Chrome";v="128"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
};

export const SOURCE_MAP: Record<string, string> = {
  web: "web",
  scholar: "scholar",
  social: "social",
  academic: "scholar",
};

export const TIME_MAP: Record<string, string> = {
  all: "",
  day: "DAY",
  week: "WEEK",
  month: "MONTH",
  year: "YEAR",
};
