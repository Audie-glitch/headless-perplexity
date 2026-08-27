import { API_VERSION, DEFAULT_LANGUAGE, DEFAULT_TIMEZONE, SOURCE_MAP, TIME_MAP } from "./constants";
import type { AskInput, PerplexityModel } from "./types";

export interface AskPayload {
  query_str: string;
  params: Record<string, unknown>;
}

export function buildAskPayload(input: AskInput, model: PerplexityModel): AskPayload {
  const query = input.query.trim();
  if (!query) {
    throw new Error("Query must not be empty");
  }

  const sources = (input.sources?.length ? input.sources : ["web"]).map(
    (source) => SOURCE_MAP[source] ?? "web",
  );
  const recency = TIME_MAP[input.timeRange ?? "all"] ?? "";

  const requestMode = model.mode === "concise" ? "CONCISE" : "COPILOT";
  const searchMode = model.mode === "research" ? "research" : "search";

  const params: Record<string, unknown> = {
    attachments: [],
    frontend_context_uuid: crypto.randomUUID(),
    frontend_uuid: crypto.randomUUID(),
    language: input.language ?? DEFAULT_LANGUAGE,
    timezone: input.timezone ?? DEFAULT_TIMEZONE,
    client_coordinates: null,
    sources,
    model_preference: model.identifier,
    mode: requestMode,
    search_mode: searchMode,
    search_focus: "internet",
    search_recency_filter: recency || null,
    is_incognito: input.incognito ?? false,
    use_schematized_api: true,
    local_search_enabled: false,
    prompt_source: "user",
    send_back_text_in_streaming_api: false,
    last_backend_uuid: null,
    version: API_VERSION,
    source: "default",
  };

  if (input.followUp?.backendUuid) {
    params.last_backend_uuid = input.followUp.backendUuid;
    params.query_source = "followup";
    if (input.followUp.readWriteToken) {
      params.read_write_token = input.followUp.readWriteToken;
    }
  }

  return {
    query_str: query,
    params,
  };
}

export function flattenChatMessages(
  messages: Array<{ role: string; content: unknown }>,
): string {
  const parts: string[] = [];

  for (const message of messages) {
    const text = normalizeContent(message.content);
    if (!text) {
      continue;
    }
    const role = message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "User";
    parts.push(`${role}: ${text}`);
  }

  return parts.join("\n\n").trim();
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text?: unknown }).text ?? "");
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}
