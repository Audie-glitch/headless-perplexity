import {
  API_BASE_URL,
  ENDPOINT_ASK,
  ENDPOINT_AUTH_SESSION,
  ENDPOINT_SEARCH_INIT,
  ENDPOINT_USER_SETTINGS,
} from "./constants";
import { AuthenticationError, RateLimitError, UpstreamError, ValidationError } from "./errors";
import { identifierForTier, resolveModel } from "./models";
import { officialAsk, officialAskStream } from "./official";
import { buildAskPayload } from "./payload";
import { buildCookieHeader, parseSessionPayload, requestHeaders, webUrl } from "./session";
import { createChromeFetch } from "./transport";
import {
  applySseData,
  createSchematizedState,
  emptyParsedState,
  incrementalText,
  parseSseLine,
  type ParsedSseState,
} from "./sse";
import type {
  AskInput,
  AskResult,
  ClientOptions,
  PerplexityModel,
  SessionInfo,
  StreamDelta,
} from "./types";

const INIT_TIMEOUT_MS = 20_000;
const ASK_TIMEOUT_MS = 180_000;

export class HeadlessPerplexity {
  private readonly sessionToken?: string;
  private readonly extraCookies?: Record<string, string>;
  private readonly rawCookieHeader?: string;
  private readonly officialApiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions = {}) {
    this.sessionToken = options.sessionToken;
    this.extraCookies = options.extraCookies;
    this.rawCookieHeader = options.rawCookieHeader;
    this.officialApiKey = options.officialApiKey;
    this.fetchImpl = options.fetchImpl ?? createChromeFetch();
  }

  async session(): Promise<SessionInfo> {
    const response = await this.webGet(ENDPOINT_AUTH_SESSION, INIT_TIMEOUT_MS);
    if (!response.ok) {
      throw this.mapStatus(response.status, await safeText(response));
    }
    return parseSessionPayload(await safeJson(response));
  }

  async settings(): Promise<unknown> {
    const response = await this.webGet(ENDPOINT_USER_SETTINGS, INIT_TIMEOUT_MS);
    if (!response.ok) {
      throw this.mapStatus(response.status, await safeText(response));
    }
    return safeJson(response);
  }

  async ask(input: AskInput): Promise<AskResult> {
    this.assertQuery(input);
    const model = this.resolve(input);

    try {
      return await this.webAsk(input, model);
    } catch (error) {
      if (this.shouldFallback(error)) {
        return officialAsk(input, model, this.officialApiKey as string, this.fetchImpl);
      }
      throw error;
    }
  }

  async *askStream(input: AskInput): AsyncGenerator<StreamDelta> {
    this.assertQuery(input);
    const model = this.resolve(input);

    try {
      yield* this.webAskStream(input, model);
    } catch (error) {
      if (this.shouldFallback(error)) {
        yield* officialAskStream(input, model, this.officialApiKey as string, this.fetchImpl);
        return;
      }
      throw error;
    }
  }

  private resolve(input: AskInput): PerplexityModel {
    return resolveModel(input.model, input.mode);
  }

  private assertQuery(input: AskInput) {
    if (!input.query?.trim()) {
      throw new ValidationError("Query must not be empty");
    }
  }

  private shouldFallback(error: unknown): boolean {
    if (!this.officialApiKey) {
      return false;
    }
    return (
      error instanceof AuthenticationError ||
      (error instanceof UpstreamError && (error.status === 403 || error.status === 401))
    );
  }

  private async webAsk(input: AskInput, model: PerplexityModel): Promise<AskResult> {
    await this.initSearch(input.query);
    const response = await this.postAsk(input, model);
    const state = emptyParsedState();
    const schematized = createSchematizedState();

    for await (const line of iterateSseLines(response)) {
      this.consumeLine(line, state, schematized);
      if (state.final && state.answer) {
        break;
      }
    }

    return this.toResult(state, model);
  }

  private async *webAskStream(input: AskInput, model: PerplexityModel): AsyncGenerator<StreamDelta> {
    await this.initSearch(input.query);
    const response = await this.postAsk(input, model);
    const state = emptyParsedState();
    const schematized = createSchematizedState();
    let published = "";
    let publishedSources = 0;

    for await (const line of iterateSseLines(response)) {
      this.consumeLine(line, state, schematized);
      const nextText = state.answer || state.chunks.join("");
      const delta = incrementalText(published, nextText);
      if (delta) {
        published = nextText;
        yield { type: "delta", text: delta };
      }
      if (state.sources.length > publishedSources) {
        publishedSources = state.sources.length;
        yield { type: "sources", sources: state.sources };
      }
      if (state.final && (state.answer || published)) {
        break;
      }
    }

    const result = this.toResult({ ...state, answer: state.answer || published }, model);
    yield { type: "done", result };
  }

  private consumeLine(line: string, state: ParsedSseState, schematized: ReturnType<typeof createSchematizedState>) {
    const data = parseSseLine(line);
    if (!data) {
      if (line.includes("event: end_of_stream")) {
        state.final = true;
      }
      return;
    }
    applySseData(data, state, schematized);
  }

  private toResult(state: ParsedSseState, model: PerplexityModel): AskResult {
    return {
      answer: state.answer,
      chunks: state.chunks,
      sources: state.sources,
      conversation: {
        backendUuid: state.backendUuid,
        readWriteToken: state.readWriteToken,
      },
      model: model.id,
      mode: model.mode,
      engine: "webui",
    };
  }

  private async initSearch(query: string): Promise<void> {
    const clipped = query.slice(0, 2000);
    const url = `${webUrl(ENDPOINT_SEARCH_INIT)}?q=${encodeURIComponent(clipped)}`;
    try {
      await this.fetchImpl(url, {
        method: "GET",
        headers: requestHeaders(this.cookieHeader()),
        redirect: "follow",
        signal: AbortSignal.timeout(INIT_TIMEOUT_MS),
      });
    } catch {
      // Search-init is a warm-up step used by the WebUI. Failure should not
      // block the SSE ask itself.
    }
  }

  private async postAsk(input: AskInput, model: PerplexityModel): Promise<Response> {
    let resolved = model;
    try {
      const session = await this.session();
      resolved = {
        ...model,
        identifier: identifierForTier(model, session.accountTier),
      };
    } catch {
      // Anonymous clients can still try the ask endpoint.
    }

    const response = await this.fetchImpl(webUrl(ENDPOINT_ASK), {
      method: "POST",
      headers: requestHeaders(this.cookieHeader(), { "content-type": "application/json" }),
      body: JSON.stringify(buildAskPayload(input, resolved)),
      signal: AbortSignal.timeout(ASK_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw this.mapStatus(response.status, await safeText(response));
    }

    return response;
  }

  private async webGet(path: string, timeoutMs: number): Promise<Response> {
    return this.fetchImpl(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: requestHeaders(this.cookieHeader()),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  private cookieHeader(): string | undefined {
    return buildCookieHeader(this.sessionToken, this.extraCookies, this.rawCookieHeader);
  }

  private mapStatus(status: number, body: string): Error {
    const lowered = body.toLowerCase();
    const cloudflare = ["cloudflare", "cf-browser-verification", "just a moment", "challenge-platform", "ray id"].some(
      (needle) => lowered.includes(needle),
    );
    if (status === 401 || status === 403) {
      return new AuthenticationError(
        cloudflare
          ? `Cloudflare blocked the request (${status}). Paste the whole Edge cookie header, including cf_clearance.`
          : `Perplexity WebUI blocked the request (${status}). Paste the whole perplexity.ai cookie header, not just the session token.`,
        status,
      );
    }
    if (status === 429) {
      return new RateLimitError();
    }
    return new UpstreamError(`Perplexity WebUI failed (${status}): ${body.slice(0, 300)}`, status);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function* iterateSseLines(response: Response): AsyncGenerator<string> {
  if (!response.body) {
    throw new UpstreamError("Perplexity returned an empty stream");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replaceAll("\r\n", "\n");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        yield line;
      }
    }
    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}
