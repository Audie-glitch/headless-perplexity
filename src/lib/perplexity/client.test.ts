import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HeadlessPerplexity } from "./client";
import { chatRequestToAsk, toChatCompletion } from "./openai";

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("HeadlessPerplexity", () => {
  it("asks the WebUI SSE endpoint without Comet", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);

      if (url.includes("/search/new")) {
        return new Response("ok");
      }
      if (url.includes("/api/auth/session")) {
        return jsonResponse(200, { user: { email: "tester@example.com", subscription_tier: "pro" } });
      }
      if (url.includes("/rest/sse/perplexity_ask")) {
        const payload = JSON.parse(String(init?.body)) as {
          query_str: string;
          params: { last_backend_uuid?: string };
        };
        assert.equal(payload.query_str, "What is QUIC?");
        assert.equal(payload.params.last_backend_uuid, null);
        return new Response(
          [
            'data: {"text":"{\\"answer\\":\\"A UDP transport\\",\\"web_results\\":[{\\"name\\":\\"IETF\\",\\"url\\":\\"https://quic.example\\",\\"snippet\\":\\"spec\\"}]}","backend_uuid":"thread-9","final":true}',
            "",
            "event: end_of_stream",
            "",
          ].join("\n"),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      throw new Error(`unexpected ${url}`);
    };

    const client = new HeadlessPerplexity({
      sessionToken: "test-session",
      fetchImpl,
    });
    const result = await client.ask({ query: "What is QUIC?", model: "perplexity/best" });

    assert.equal(result.engine, "webui");
    assert.equal(result.answer, "A UDP transport");
    assert.equal(result.sources[0]?.title, "IETF");
    assert.equal(result.conversation.backendUuid, "thread-9");
    assert.ok(calls.some((call) => call.includes("/rest/sse/perplexity_ask")));
    assert.ok(!calls.some((call) => call.includes("comet")));
  });

  it("falls back to the official API when the WebUI returns 403", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("api.perplexity.ai")) {
        return jsonResponse(200, {
          choices: [{ message: { content: "Official fallback answer" } }],
        });
      }
      if (url.includes("/search/new")) {
        return new Response("ok");
      }
      if (url.includes("/api/auth/session") || url.includes("/rest/sse/perplexity_ask")) {
        return new Response("blocked", { status: 403 });
      }
      throw new Error(`unexpected ${url}`);
    };

    const client = new HeadlessPerplexity({
      officialApiKey: "pplx-test",
      fetchImpl,
    });
    const result = await client.ask({ query: "fallback please" });
    assert.equal(result.engine, "official");
    assert.equal(result.answer, "Official fallback answer");
  });
});

describe("OpenAI adapter", () => {
  it("maps chat completions onto ask input", () => {
    const ask = chatRequestToAsk({
      model: "perplexity/best",
      messages: [{ role: "user", content: "Summarize QUIC" }],
    });
    assert.equal(ask.query, "User: Summarize QUIC");
    assert.equal(ask.model, "perplexity/best");
  });

  it("wraps an ask result as a chat completion", () => {
    const completion = toChatCompletion(
      {
        answer: "done",
        chunks: ["done"],
        sources: [],
        conversation: { backendUuid: "t", readWriteToken: null },
        model: "perplexity/best",
        mode: "copilot",
        engine: "webui",
      },
      "perplexity/best",
    );
    assert.equal(completion.object, "chat.completion");
    assert.equal(completion.choices[0]?.message.content, "done");
    assert.equal(completion.perplexity.engine, "webui");
  });
});
