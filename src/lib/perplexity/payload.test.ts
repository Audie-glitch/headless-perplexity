import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveModel } from "./models";
import { buildAskPayload, flattenChatMessages } from "./payload";

describe("buildAskPayload", () => {
  it("builds a first-turn WebUI payload", () => {
    const payload = buildAskPayload(
      { query: "What is DNS over HTTPS?", sources: ["web", "scholar"] },
      resolveModel("perplexity/best"),
    );

    assert.equal(payload.query_str, "What is DNS over HTTPS?");
    assert.equal(payload.params.model_preference, "turbo");
    assert.equal(payload.params.mode, "copilot");
    assert.deepEqual(payload.params.sources, ["web", "scholar"]);
    assert.equal(payload.params.use_schematized_api, true);
    assert.equal(payload.params.last_backend_uuid, undefined);
  });

  it("attaches follow-up tokens", () => {
    const payload = buildAskPayload(
      {
        query: "Explain it simpler",
        followUp: { backendUuid: "abc", readWriteToken: "rw" },
      },
      resolveModel("perplexity/auto"),
    );

    assert.equal(payload.params.last_backend_uuid, "abc");
    assert.equal(payload.params.read_write_token, "rw");
    assert.equal(payload.params.query_source, "followup");
    assert.equal(payload.params.mode, "concise");
  });
});

describe("flattenChatMessages", () => {
  it("joins roles into a single query", () => {
    const query = flattenChatMessages([
      { role: "system", content: "Be concise." },
      { role: "user", content: "What is QUIC?" },
      { role: "assistant", content: "A transport protocol." },
      { role: "user", content: [{ type: "text", text: "Why is it faster?" }] },
    ]);

    assert.match(query, /System: Be concise/);
    assert.match(query, /User: What is QUIC/);
    assert.match(query, /Assistant: A transport protocol/);
    assert.match(query, /User: Why is it faster/);
  });
});
