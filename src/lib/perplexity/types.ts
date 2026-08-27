export type SearchMode = "auto" | "pro" | "reasoning" | "research";
export type SourceFocus = "web" | "scholar" | "social";
export type TimeRange = "all" | "day" | "week" | "month" | "year";
export type AccountTier = "free" | "pro" | "max" | "unknown";
export type ModelStatus = "available" | "unknown" | "unavailable";

export interface PerplexityModel {
  id: string;
  name: string;
  description: string;
  identifier: string;
  identifierByTier?: Partial<Record<AccountTier, string>>;
  mode: "concise" | "copilot" | "research";
  minTier: AccountTier;
  provider: string;
  status: ModelStatus;
}

export interface ConversationCursor {
  backendUuid?: string | null;
  readWriteToken?: string | null;
}

export interface AskInput {
  query: string;
  model?: string;
  mode?: SearchMode;
  sources?: SourceFocus[];
  language?: string;
  timezone?: string;
  incognito?: boolean;
  timeRange?: TimeRange;
  followUp?: ConversationCursor;
}

export interface SearchResult {
  title: string | null;
  snippet: string | null;
  url: string | null;
}

export interface AskResult {
  answer: string;
  chunks: string[];
  sources: SearchResult[];
  conversation: {
    backendUuid: string | null;
    readWriteToken: string | null;
  };
  model: string;
  mode: string;
  engine: "webui" | "official";
}

export interface StreamDelta {
  type: "delta" | "sources" | "done" | "error";
  text?: string;
  sources?: SearchResult[];
  result?: AskResult;
  error?: {
    code: string;
    message: string;
    status?: number;
  };
}

export interface SessionInfo {
  authenticated: boolean;
  email?: string;
  accountTier: AccountTier;
  raw?: unknown;
}

export interface ClientOptions {
  sessionToken?: string;
  extraCookies?: Record<string, string>;
  officialApiKey?: string;
  fetchImpl?: typeof fetch;
}
