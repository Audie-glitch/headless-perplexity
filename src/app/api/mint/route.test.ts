import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "./route";

function post(body: unknown, headers?: HeadersInit) {
  return POST(
    new Request("http://127.0.0.1:43147/api/mint", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/mint", () => {
  it("rejects an empty body", async () => {
    const response = await post({});
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
  });

  it("rejects Emailnator cookies without XSRF-TOKEN", async () => {
    const response = await post({ emailnatorCookies: "emailnator_session=only" });
    const payload = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(response.status, 400);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
    assert.match(payload.error.message, /XSRF-TOKEN/);
  });

  it("rejects a non-Perplexity callback URL", async () => {
    const response = await post({ callbackUrl: "https://example.com/not-perplexity" });
    const payload = (await response.json()) as { error: { code: string; message: string } };
    assert.equal(response.status, 400);
    assert.match(payload.error.message, /callback URL/i);
  });
});
