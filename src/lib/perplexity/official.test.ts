import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveModel } from "./models";
import { officialAsk, officialAskStream } from "./official";

function capture(response: () => Response) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return response();
  };
  return { calls, fetchImpl };
}

describe("official API attribution", () => {
  it("sends X-Pplx-Integration on non-streaming requests", async () => {
    const { calls, fetchImpl } = capture(
      () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    await officialAsk({ query: "hi" }, resolveModel("perplexity/best"), "pplx-test", fetchImpl);
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).host, "api.perplexity.ai");
    assert.equal(calls[0].headers.get("x-pplx-integration"), "headless-perplexity");
  });

  it("sends X-Pplx-Integration on streaming requests", async () => {
    const { calls, fetchImpl } = capture(
      () => new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n', { status: 200 }),
    );
    for await (const delta of officialAskStream({ query: "hi" }, resolveModel("perplexity/best"), "pplx-test", fetchImpl)) {
      void delta;
    }
    assert.equal(calls.length, 1);
    assert.equal(new URL(calls[0].url).host, "api.perplexity.ai");
    assert.equal(calls[0].headers.get("x-pplx-integration"), "headless-perplexity");
  });
});
