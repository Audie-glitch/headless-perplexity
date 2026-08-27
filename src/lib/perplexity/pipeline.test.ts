import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HeadlessPerplexity } from "./client";
import { mintAccount } from "./mint";
import { chatRequestToAsk, toChatCompletion } from "./openai";
import { POST as mintPost } from "../../app/api/mint/route";
import { POST as askPost } from "../../app/api/ask/route";
import { POST as chatPost } from "../../app/api/v1/chat/completions/route";

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mintThenAskFetch(): typeof fetch {
  let listed = 0;
  return async (input, init) => {
    const url = String(input);

    if (url.includes("emailnator.com/generate-email")) {
      return jsonResponse(200, { email: ["pipeline@gmail.com"] });
    }
    if (url.includes("emailnator.com/message-list")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { messageID?: string };
      if (body.messageID) {
        return new Response(
          `"https://www.perplexity.ai/api/auth/callback/email?callbackUrl=https%3A%2F%2Fwww.perplexity.ai&token=pipe&email=pipeline%40gmail.com"`,
        );
      }
      listed += 1;
      if (listed === 1) {
        return jsonResponse(200, { messageData: [{ messageID: "ad", subject: "Welcome" }] });
      }
      return jsonResponse(200, {
        messageData: [
          { messageID: "ad", subject: "Welcome" },
          { messageID: "mail", subject: "Sign in to Perplexity" },
        ],
      });
    }
    if (url.includes("/api/auth/csrf")) {
      return jsonResponse(200, { csrfToken: "csrf-pipe" });
    }
    if (url.includes("/api/auth/signin/email")) {
      return jsonResponse(200, { url: "https://www.perplexity.ai" });
    }
    if (url.includes("/api/auth/callback/email")) {
      const headers = new Headers();
      headers.append("set-cookie", "__Secure-next-auth.session-token=pipe-session; Path=/; Secure");
      headers.append("set-cookie", "cf_clearance=pipe-clearance; Path=/");
      return new Response("ok", { status: 200, headers });
    }
    if (url.includes("/search/new")) {
      return new Response("ok");
    }
    if (url.includes("/api/auth/session")) {
      return jsonResponse(200, { user: { email: "pipeline@gmail.com", subscription_tier: "free" } });
    }
    if (url.includes("/rest/sse/perplexity_ask")) {
      return new Response(
        [
          'data: {"text":"{\\"answer\\":\\"DoH uses HTTPS to resolve names.\\",\\"web_results\\":[{\\"name\\":\\"RFC 8484\\",\\"url\\":\\"https://doh.example\\",\\"snippet\\":\\"DNS over HTTPS\\"}]}","backend_uuid":"thread-pipe","final":true}',
          "",
          "event: end_of_stream",
          "",
        ].join("\n"),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }
    throw new Error(`unexpected ${url}`);
  };
}

describe("full API process", () => {
  it("mints a session, asks the WebUI, and wraps an OpenAI completion", async () => {
    const fetchImpl = mintThenAskFetch();
    const minted = await mintAccount({
      emailnatorCookies: "XSRF-TOKEN=token; emailnator_session=abc",
      fetchImpl,
      pollMs: 1,
      pollTimeoutMs: 50,
    });
    assert.equal(minted.email, "pipeline@gmail.com");
    assert.equal(minted.sessionToken, "pipe-session");
    assert.match(minted.cookies, /cf_clearance=pipe-clearance/);

    const client = new HeadlessPerplexity({
      rawCookieHeader: minted.cookies,
      sessionToken: minted.sessionToken,
      fetchImpl,
    });
    const asked = await client.ask({ query: "What is DNS over HTTPS?", model: "perplexity/best" });
    assert.equal(asked.engine, "webui");
    assert.match(asked.answer, /DoH/);
    assert.equal(asked.conversation.backendUuid, "thread-pipe");

    const completion = toChatCompletion(asked, "perplexity/best");
    assert.equal(completion.choices[0]?.message.content, asked.answer);
    assert.equal(chatRequestToAsk({ messages: [{ role: "user", content: "What is DNS over HTTPS?" }] }).query.includes("DNS"), true);
  });
});

describe("HTTP route validation", () => {
  it("rejects an empty ask query", async () => {
    const response = await askPost(
      new Request("http://127.0.0.1:43147/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "   ", stream: false }),
      }),
    );
    assert.equal(response.status, 400);
  });

  it("rejects empty chat messages", async () => {
    const response = await chatPost(
      new Request("http://127.0.0.1:43147/api/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "perplexity/best", messages: [] }),
      }),
    );
    assert.equal(response.status, 400);
  });

  it("rejects mint without cookies or a callback", async () => {
    const response = await mintPost(
      new Request("http://127.0.0.1:43147/api/mint", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    assert.equal(response.status, 400);
  });
});
