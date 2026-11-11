import { OFFICIAL_API_BASE_URL, OFFICIAL_INTEGRATION_HEADER } from "./constants";
import { AuthenticationError, RateLimitError, UpstreamError } from "./errors";
import { officialModelFor } from "./models";
import type { AskInput, AskResult, PerplexityModel, StreamDelta } from "./types";

interface OfficialChoice {
  message?: { content?: string };
  delta?: { content?: string };
}

interface OfficialResponse {
  choices?: OfficialChoice[];
}

export async function officialAsk(
  input: AskInput,
  model: PerplexityModel,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<AskResult> {
  const response = await fetchImpl(`${OFFICIAL_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-pplx-integration": OFFICIAL_INTEGRATION_HEADER,
    },
    body: JSON.stringify({
      model: officialModelFor(model),
      messages: [{ role: "user", content: input.query }],
    }),
  });

  if (!response.ok) {
    throw mapOfficialStatus(response.status, await safeText(response));
  }

  const payload = (await response.json()) as OfficialResponse;
  const answer = payload.choices?.[0]?.message?.content ?? "";

  return {
    answer,
    chunks: answer ? [answer] : [],
    sources: [],
    conversation: { backendUuid: null, readWriteToken: null },
    model: model.id,
    mode: model.mode,
    engine: "official",
  };
}

export async function* officialAskStream(
  input: AskInput,
  model: PerplexityModel,
  apiKey: string,
  fetchImpl: typeof fetch,
): AsyncGenerator<StreamDelta> {
  const response = await fetchImpl(`${OFFICIAL_API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "x-pplx-integration": OFFICIAL_INTEGRATION_HEADER,
    },
    body: JSON.stringify({
      model: officialModelFor(model),
      messages: [{ role: "user", content: input.query }],
      stream: true,
    }),
  });

  if (!response.ok) {
    throw mapOfficialStatus(response.status, await safeText(response));
  }

  if (!response.body) {
    throw new UpstreamError("Official Perplexity API returned an empty stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  for await (const chunk of streamChunks(response.body)) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }
      try {
        const parsed = JSON.parse(payload) as OfficialResponse;
        const delta = parsed.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          answer += delta;
          yield { type: "delta", text: delta };
        }
      } catch {
        continue;
      }
    }
  }

  yield {
    type: "done",
    result: {
      answer,
      chunks: answer ? [answer] : [],
      sources: [],
      conversation: { backendUuid: null, readWriteToken: null },
      model: model.id,
      mode: model.mode,
      engine: "official",
    },
  };
}

function mapOfficialStatus(status: number, body: string): Error {
  if (status === 401 || status === 403) {
    return new AuthenticationError(`Official Perplexity API rejected the key (${status})`);
  }
  if (status === 429) {
    return new RateLimitError("Official Perplexity API rate-limited the request.");
  }
  return new UpstreamError(`Official Perplexity API failed (${status}): ${body.slice(0, 300)}`, status);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function* streamChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        yield value;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
