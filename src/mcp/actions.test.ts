import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askAction, healthAction, mintAction, modelsAction } from "./actions";

describe("MCP actions", () => {
  it("reports health without Comet", () => {
    const health = healthAction();
    assert.equal(health.ok, true);
    assert.equal(health.cometRequired, false);
    assert.equal(health.mcp, true);
    assert.ok(modelsAction().some((model) => model.id === "perplexity/best"));
  });

  it("asks through the WebUI client", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/search/new")) {
        return new Response("ok");
      }
      if (url.includes("/rest/sse/perplexity_ask")) {
        return new Response(
          'data: {"text":"{\\"answer\\":\\"MCP ask works\\",\\"web_results\\":[]}","backend_uuid":"m1","final":true}\n\n',
          { status: 200, headers: { "content-type": "text/event-stream" } },
        );
      }
      throw new Error(`unexpected ${url}`);
    };

    const result = await askAction({ query: "ping", fetchImpl });
    assert.equal(result.answer, "MCP ask works");
    assert.equal(result.engine, "webui");
  });

  it("redeems a callback URL through mintAction", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/callback/email")) {
        const headers = new Headers();
        headers.append("set-cookie", "__Secure-next-auth.session-token=mcp-session; Path=/");
        return new Response("ok", { status: 200, headers });
      }
      throw new Error(`unexpected ${url}`);
    };

    const minted = await mintAction({
      callbackUrl: "https://www.perplexity.ai/api/auth/callback/email?token=1&email=a%40b.com",
      fetchImpl,
    });
    assert.equal(minted.sessionToken, "mcp-session");
  });
});
