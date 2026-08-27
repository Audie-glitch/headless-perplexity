import { RateLimitError, UpstreamError } from "./errors";
import type { SearchResult } from "./types";

export interface SchematizedStreamState {
  workflowBlock: Record<string, unknown> | null;
  answer: string | null;
  chunks: string[];
}

export interface ParsedSseState {
  answer: string;
  chunks: string[];
  sources: SearchResult[];
  backendUuid: string | null;
  readWriteToken: string | null;
  final: boolean;
}

export function createSchematizedState(): SchematizedStreamState {
  return { workflowBlock: null, answer: null, chunks: [] };
}

export function parseSseLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function applySseData(
  data: Record<string, unknown>,
  state: ParsedSseState,
  schematized: SchematizedStreamState,
): ParsedSseState {
  if (typeof data.backend_uuid === "string") {
    state.backendUuid = data.backend_uuid;
  }
  if (typeof data.read_write_token === "string") {
    state.readWriteToken = data.read_write_token;
  }
  if (data.final === true || data.final_sse_message === true || data.text_completed === true) {
    state.final = true;
  }

  const status = String(data.status ?? "").toUpperCase();
  const errorCode = data.error_code;
  if (errorCode != null) {
    const message = String(data.text ?? errorCode);
    if (String(errorCode).toUpperCase().includes("RATE_LIMIT")) {
      throw new RateLimitError(message);
    }
    throw new UpstreamError(message);
  }
  if (status === "FAILED") {
    throw new UpstreamError(String(data.text ?? "Query processing failed"));
  }

  if (Array.isArray(data.blocks)) {
    const extracted = processSchematizedBlocks(data, schematized);
    mergeExtracted(state, extracted);
    return state;
  }

  if (typeof data.text === "string") {
    const extracted = processTextField(data.text);
    mergeExtracted(state, extracted);
    return state;
  }

  if (typeof data.answer === "string" || Array.isArray(data.web_results) || Array.isArray(data.chunks)) {
    mergeExtracted(state, extractFromAnswerObject(data));
  }

  return state;
}

function mergeExtracted(
  state: ParsedSseState,
  extracted: { answer?: string | null; chunks?: string[]; sources?: SearchResult[] },
) {
  if (extracted.answer) {
    state.answer = extracted.answer;
  }
  if (extracted.chunks?.length) {
    state.chunks = extracted.chunks;
    if (!state.answer) {
      state.answer = extracted.chunks.join("");
    }
  }
  if (extracted.sources?.length) {
    state.sources = extracted.sources;
  }
}

function processTextField(text: string): {
  answer?: string | null;
  chunks?: string[];
  sources?: SearchResult[];
} {
  const nested = tryParseJson(text);
  if (Array.isArray(nested)) {
    return processBlockList(nested);
  }
  if (nested && typeof nested === "object") {
    return extractFromAnswerObject(nested as Record<string, unknown>);
  }
  return { answer: text };
}

function processBlockList(blocks: unknown[]): {
  answer?: string | null;
  chunks?: string[];
  sources?: SearchResult[];
} {
  for (const item of blocks) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const block = item as Record<string, unknown>;
    if (block.step_type === "FINAL") {
      const content = (block.content ?? {}) as Record<string, unknown>;
      const answerContent = content.answer;
      if (typeof answerContent === "string") {
        const nested = tryParseJson(answerContent);
        if (nested && typeof nested === "object" && !Array.isArray(nested)) {
          return extractFromAnswerObject(nested as Record<string, unknown>);
        }
      }
      return extractFromAnswerObject(content);
    }
  }
  return {};
}

function extractFromAnswerObject(data: Record<string, unknown>): {
  answer?: string | null;
  chunks?: string[];
  sources?: SearchResult[];
} {
  const webResults = Array.isArray(data.web_results) ? data.web_results : [];
  const sources = webResults
    .filter((result): result is Record<string, unknown> => Boolean(result) && typeof result === "object")
    .map((result) => ({
      title: stringOrNull(result.name ?? result.title),
      snippet: stringOrNull(result.snippet),
      url: stringOrNull(result.url),
    }));

  const chunks = Array.isArray(data.chunks)
    ? data.chunks.filter((chunk): chunk is string => typeof chunk === "string")
    : [];

  return {
    answer: typeof data.answer === "string" ? data.answer : null,
    chunks,
    sources,
  };
}

function processSchematizedBlocks(
  data: Record<string, unknown>,
  schematized: SchematizedStreamState,
): { answer?: string | null; chunks?: string[]; sources?: SearchResult[] } {
  for (const raw of data.blocks as unknown[]) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const block = raw as Record<string, unknown>;
    if (block.workflow_block && typeof block.workflow_block === "object") {
      schematized.workflowBlock = structuredClone(block.workflow_block) as Record<string, unknown>;
    }
    const diff = block.diff_block;
    if (diff && typeof diff === "object" && schematized.workflowBlock) {
      const patches = (diff as { patches?: unknown }).patches;
      if (Array.isArray(patches)) {
        for (const patch of patches) {
          if (patch && typeof patch === "object") {
            applyJsonPatch(schematized.workflowBlock, patch as Record<string, unknown>);
          }
        }
      }
    }
  }

  if (!schematized.workflowBlock) {
    return {};
  }

  return extractWorkflowText(schematized.workflowBlock);
}

function extractWorkflowText(workflowBlock: Record<string, unknown>): {
  answer?: string | null;
  chunks?: string[];
  sources?: SearchResult[];
} {
  const steps = Array.isArray(workflowBlock.steps) ? workflowBlock.steps : [];
  for (const step of steps) {
    if (!step || typeof step !== "object") {
      continue;
    }
    const items = Array.isArray((step as { items?: unknown }).items)
      ? ((step as { items: unknown[] }).items)
      : [];
    for (const item of items) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const payload = (item as { payload?: unknown }).payload;
      const textPayload =
        payload && typeof payload === "object"
          ? ((payload as { text_payload?: unknown }).text_payload as Record<string, unknown> | undefined)
          : undefined;
      if (!textPayload) {
        continue;
      }
      const rawChunks = Array.isArray(textPayload.chunks) ? textPayload.chunks : [];
      const chunks = rawChunks.filter((chunk): chunk is string => typeof chunk === "string");
      const answer = typeof textPayload.text === "string" ? textPayload.text : null;
      if (answer || chunks.length) {
        return { answer, chunks };
      }
    }
  }
  return {};
}

export function applyJsonPatch(document: unknown, operation: Record<string, unknown>): void {
  const op = operation.op;
  const tokens = jsonPointerTokens(String(operation.path ?? ""));
  if (!tokens.length) {
    return;
  }

  let target: unknown = document;
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(target)) {
      target = target[Number(token)];
    } else if (target && typeof target === "object") {
      target = (target as Record<string, unknown>)[token];
    } else {
      return;
    }
  }

  const key = tokens[tokens.length - 1];
  if (Array.isArray(target)) {
    if (op === "add") {
      if (key === "-") {
        target.push(operation.value);
      } else {
        target.splice(Number(key), 0, operation.value);
      }
    } else if (op === "replace") {
      target[Number(key)] = operation.value;
    } else if (op === "remove") {
      target.splice(Number(key), 1);
    }
    return;
  }

  if (!target || typeof target !== "object") {
    return;
  }

  const objectTarget = target as Record<string, unknown>;
  if (op === "add" || op === "replace") {
    objectTarget[key] = operation.value;
  } else if (op === "remove") {
    delete objectTarget[key];
  }
}

function jsonPointerTokens(path: string): string[] {
  if (!path || !path.startsWith("/")) {
    return [];
  }
  return path
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function emptyParsedState(): ParsedSseState {
  return {
    answer: "",
    chunks: [],
    sources: [],
    backendUuid: null,
    readWriteToken: null,
    final: false,
  };
}

export function incrementalText(previous: string, next: string): string {
  if (!next) {
    return "";
  }
  if (!previous) {
    return next;
  }
  if (next.startsWith(previous)) {
    return next.slice(previous.length);
  }
  if (previous.startsWith(next)) {
    return "";
  }
  return next;
}
