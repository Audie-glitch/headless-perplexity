import { randomUUID } from "node:crypto";
import { flattenChatMessages } from "./payload";
import type { AskInput, AskResult, ConversationCursor } from "./types";

export interface ChatMessage {
  role: string;
  content: unknown;
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  perplexity?: {
    sources?: AskInput["sources"];
    timeRange?: AskInput["timeRange"];
    incognito?: boolean;
    language?: string;
    thread?: ConversationCursor;
  };
}

export function chatRequestToAsk(body: ChatCompletionRequest): AskInput {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const query = flattenChatMessages(body.messages);
  if (!query) {
    throw new Error("messages did not contain any text");
  }

  return {
    query,
    model: body.model,
    sources: body.perplexity?.sources,
    timeRange: body.perplexity?.timeRange,
    incognito: body.perplexity?.incognito,
    language: body.perplexity?.language,
    followUp: body.perplexity?.thread,
  };
}

export function toChatCompletion(result: AskResult, model: string) {
  const id = `chatcmpl_${randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: result.answer,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    perplexity: {
      engine: result.engine,
      sources: result.sources,
      conversation: result.conversation,
      mode: result.mode,
    },
  };
}

export function toChatChunk(
  delta: string,
  model: string,
  id: string,
  created: number,
  finish = false,
) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta: finish ? {} : { content: delta },
        finish_reason: finish ? "stop" : null,
      },
    ],
  };
}
