import { randomUUID } from "node:crypto";
import {
  chatRequestToAsk,
  clientOptionsFromRequest,
  errorToPayload,
  HeadlessPerplexity,
  toChatChunk,
  toChatCompletion,
  ValidationError,
  type ChatCompletionRequest,
} from "@/lib/perplexity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: ChatCompletionRequest;

  try {
    body = (await request.json()) as ChatCompletionRequest;
  } catch {
    return Response.json(
      { error: { message: "Invalid JSON body", type: "invalid_request_error" } },
      { status: 400 },
    );
  }

  let askInput;
  try {
    askInput = chatRequestToAsk(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid messages";
    return Response.json({ error: { message, type: "invalid_request_error" } }, { status: 400 });
  }

  const client = new HeadlessPerplexity(clientOptionsFromRequest(request));
  const model = body.model || "perplexity/best";

  if (body.stream) {
    const id = `chatcmpl_${randomUUID()}`;
    const created = Math.floor(Date.now() / 1000);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (payload: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        try {
          for await (const event of client.askStream(askInput)) {
            if (event.type === "delta" && event.text) {
              send(toChatChunk(event.text, model, id, created));
            }
            if (event.type === "done") {
              send(toChatChunk("", model, id, created, true));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          const payload = errorToPayload(error);
          send({ error: { message: payload.message, type: payload.code } });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  try {
    const result = await client.ask(askInput);
    return Response.json(toChatCompletion(result, model));
  } catch (error) {
    const payload = errorToPayload(error);
    const status = error instanceof ValidationError ? 400 : (payload.status ?? 502);
    return Response.json(
      { error: { message: payload.message, type: payload.code } },
      { status },
    );
  }
}
