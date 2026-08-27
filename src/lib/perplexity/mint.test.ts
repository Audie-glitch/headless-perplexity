import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidationError } from "./errors";
import {
  completeMintFromLink,
  emailnatorCookieHeader,
  extractSignInLink,
  mintAccount,
  resolveEmailnatorCookies,
} from "./mint";

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("extractSignInLink", () => {
  it("finds a quoted callback URL and decodes HTML entities", () => {
    const html = `
      <a href="https://www.perplexity.ai/api/auth/callback/email?callbackUrl=https%3A%2F%2Fwww.perplexity.ai&amp;token=abc&amp;email=user%40gmail.com">
        Sign in
      </a>
    `;
    assert.equal(
      extractSignInLink(html),
      "https://www.perplexity.ai/api/auth/callback/email?callbackUrl=https%3A%2F%2Fwww.perplexity.ai&token=abc&email=user%40gmail.com",
    );
  });

  it("finds a bare callback URL", () => {
    assert.equal(
      extractSignInLink("Click https://www.perplexity.ai/api/auth/callback/email?token=xyz to continue"),
      "https://www.perplexity.ai/api/auth/callback/email?token=xyz",
    );
  });

  it("returns null when no Perplexity sign-in URL exists", () => {
    assert.equal(extractSignInLink("Welcome to Emailnator"), null);
  });
});

describe("emailnatorCookieHeader", () => {
  it("accepts a Cookie header and a JSON object", () => {
    const header = emailnatorCookieHeader("XSRF-TOKEN=token%3D1; emailnator_session=abc");
    assert.equal(header.xsrf, "token=1");
    assert.match(header.header, /XSRF-TOKEN=token%3D1/);

    const json = emailnatorCookieHeader(JSON.stringify({ "XSRF-TOKEN": "abc", extra: "1" }));
    assert.equal(json.xsrf, "abc");
    assert.match(json.header, /XSRF-TOKEN=abc/);
  });

  it("rejects cookies without XSRF-TOKEN", () => {
    assert.throws(() => emailnatorCookieHeader("session=only"), ValidationError);
  });
});

describe("resolveEmailnatorCookies", () => {
  it("prefers explicit cookies over the request header", () => {
    const request = new Request("http://localhost/api/mint", {
      headers: { "x-emailnator-cookies": "from-header" },
    });
    assert.equal(resolveEmailnatorCookies({ cookies: " from-body ", request }), "from-body");
    assert.equal(resolveEmailnatorCookies({ request }), "from-header");
  });
});

describe("mintAccount", () => {
  it("mints a session from Emailnator and the email callback", async () => {
    let listed = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);

      if (url.includes("emailnator.com/generate-email")) {
        return jsonResponse(200, { email: ["user@gmail.com"] });
      }

      if (url.includes("emailnator.com/message-list")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messageID?: string };
        if (body.messageID) {
          return new Response(
            `<a href="https://www.perplexity.ai/api/auth/callback/email?callbackUrl=https%3A%2F%2Fwww.perplexity.ai&amp;token=abc&amp;email=user%40gmail.com">Sign in</a>`,
          );
        }
        listed += 1;
        if (listed === 1) {
          return jsonResponse(200, { messageData: [{ messageID: "ad-1", subject: "Welcome" }] });
        }
        return jsonResponse(200, {
          messageData: [
            { messageID: "ad-1", subject: "Welcome" },
            { messageID: "m-2", subject: "Sign in to Perplexity" },
          ],
        });
      }

      if (url.includes("/api/auth/csrf")) {
        const headers = new Headers();
        headers.append("set-cookie", "next-auth.csrf-token=csrf123%7Csig; Path=/");
        return jsonResponse(200, { csrfToken: "csrf123" }, headers);
      }

      if (url.includes("/api/auth/session")) {
        return jsonResponse(200, {});
      }

      if (url.includes("/api/auth/signin/email")) {
        assert.match(String(init?.body), /user(%40|@)gmail.com/);
        assert.match(String(init?.body), /csrf123/);
        return jsonResponse(200, { url: "https://www.perplexity.ai" });
      }

      if (url.includes("/api/auth/callback/email")) {
        const headers = new Headers();
        headers.append(
          "set-cookie",
          "__Secure-next-auth.session-token=minted-session; Path=/; Secure; HttpOnly",
        );
        headers.set("location", "https://www.perplexity.ai/");
        return new Response(null, { status: 302, headers });
      }

      if (url === "https://www.perplexity.ai/" || url === "https://www.perplexity.ai") {
        return new Response("ok", { status: 200 });
      }

      throw new Error(`unexpected ${url}`);
    };

    const result = await mintAccount({
      emailnatorCookies: "XSRF-TOKEN=token%3D1; emailnator_session=abc",
      fetchImpl,
      pollMs: 1,
      pollTimeoutMs: 50,
    });

    assert.equal(result.email, "user@gmail.com");
    assert.equal(result.sessionToken, "minted-session");
    assert.match(result.cookies, /__Secure-next-auth.session-token=minted-session/);
  });
});

describe("completeMintFromLink", () => {
  it("follows the callback and collects the session cookie", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/callback/email")) {
        const headers = new Headers();
        headers.append("set-cookie", "__Secure-next-auth.session-token=from-link; Path=/");
        return new Response("ok", { status: 200, headers });
      }
      throw new Error(`unexpected ${url}`);
    };

    const result = await completeMintFromLink(
      "https://www.perplexity.ai/api/auth/callback/email?token=abc&email=mint%40gmail.com",
      fetchImpl,
    );
    assert.equal(result.sessionToken, "from-link");
    assert.equal(result.email, "mint@gmail.com");
  });
});
