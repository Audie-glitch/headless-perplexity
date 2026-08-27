import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyJsonPatch,
  applySseData,
  createSchematizedState,
  emptyParsedState,
  incrementalText,
  parseSseLine,
} from "./sse";

describe("parseSseLine", () => {
  it("parses data lines and ignores noise", () => {
    const parsed = parseSseLine('data: {"answer":"Hi","backend_uuid":"u1"}');
    assert.deepEqual(parsed, { answer: "Hi", backend_uuid: "u1" });
    assert.equal(parseSseLine("event: end_of_stream"), null);
    assert.equal(parseSseLine("data: [DONE]"), null);
  });
});

describe("applySseData", () => {
  it("reads the legacy nested text payload", () => {
    const state = emptyParsedState();
    applySseData(
      {
        text: JSON.stringify({
          answer: "Hello world",
          chunks: ["Hello ", "world"],
          web_results: [{ name: "Example", url: "https://example.com", snippet: "demo" }],
        }),
        backend_uuid: "thread-1",
        read_write_token: "tok",
        final: true,
      },
      state,
      createSchematizedState(),
    );

    assert.equal(state.answer, "Hello world");
    assert.deepEqual(state.chunks, ["Hello ", "world"]);
    assert.equal(state.sources[0]?.url, "https://example.com");
    assert.equal(state.backendUuid, "thread-1");
    assert.equal(state.readWriteToken, "tok");
    assert.equal(state.final, true);
  });

  it("accumulates current markdown_block chunks", () => {
    const state = emptyParsedState();
    const schematized = createSchematizedState();

    applySseData(
      {
        status: "PENDING",
        blocks: [
          {
            intended_usage: "ask_text",
            markdown_block: {
              progress: "IN_PROGRESS",
              chunks: ["DNS over HTTPS"],
              chunk_starting_offset: 0,
            },
          },
        ],
      },
      state,
      schematized,
    );
    applySseData(
      {
        status: "COMPLETED",
        final: true,
        blocks: [
          {
            intended_usage: "ask_text",
            markdown_block: {
              progress: "DONE",
              chunks: [" encrypts DNS queries."],
              chunk_starting_offset: 1,
              answer: "DNS over HTTPS encrypts DNS queries.",
            },
          },
        ],
      },
      state,
      schematized,
    );

    assert.equal(state.answer, "DNS over HTTPS encrypts DNS queries.");
    assert.deepEqual(state.chunks, ["DNS over HTTPS", " encrypts DNS queries."]);
    assert.equal(state.final, true);
  });

  it("applies schematized workflow patches", () => {
    const state = emptyParsedState();
    const schematized = createSchematizedState();

    applySseData(
      {
        blocks: [
          {
            workflow_block: {
              steps: [
                {
                  items: [
                    {
                      payload: {
                        text_payload: { text: "Hel", chunks: ["Hel"] },
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
      state,
      schematized,
    );

    applySseData(
      {
        blocks: [
          {
            diff_block: {
              patches: [
                {
                  op: "replace",
                  path: "/steps/0/items/0/payload/text_payload/text",
                  value: "Hello",
                },
                {
                  op: "replace",
                  path: "/steps/0/items/0/payload/text_payload/chunks",
                  value: ["Hello"],
                },
              ],
            },
          },
        ],
        backend_uuid: "patched",
      },
      state,
      schematized,
    );

    assert.equal(state.answer, "Hello");
    assert.deepEqual(state.chunks, ["Hello"]);
    assert.equal(state.backendUuid, "patched");
  });
});

describe("applyJsonPatch", () => {
  it("adds, replaces, and removes object fields", () => {
    const document: Record<string, unknown> = { keep: true };
    applyJsonPatch(document, { op: "add", path: "/name", value: "plex" });
    applyJsonPatch(document, { op: "replace", path: "/name", value: "headless" });
    applyJsonPatch(document, { op: "remove", path: "/keep" });
    assert.deepEqual(document, { name: "headless" });
  });
});

describe("incrementalText", () => {
  it("emits only the new suffix", () => {
    assert.equal(incrementalText("", "Hel"), "Hel");
    assert.equal(incrementalText("Hel", "Hello"), "lo");
    assert.equal(incrementalText("Hello", "Hello"), "");
  });
});
