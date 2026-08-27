import { clientOptionsFromRequest, errorToPayload, HeadlessPerplexity } from "@/lib/perplexity";
import type { AskRequestBody, StreamDelta } from "@/lib/perplexity";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: AskRequestBody;

  try {
    body = (await request.json()) as AskRequestBody;
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } }, { status: 400 });
  }

  const { cookies, stream, ...askInput } = body;
  const client = new HeadlessPerplexity(clientOptionsFromRequest(request, cookies));

  if (stream) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: StreamDelta) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };

        try {
          for await (const event of client.askStream(askInput)) {
            send(event);
          }
        } catch (error) {
          send({ type: "error", error: errorToPayload(error) });
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
    return Response.json(result);
  } catch (error) {
    const payload = errorToPayload(error);
    return Response.json({ error: payload }, { status: payload.status ?? 502 });
  }
}
