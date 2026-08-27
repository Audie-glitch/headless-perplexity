import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCookieHeader,
  looksLikeCookieJar,
  parseCookieString,
  sessionTokenFromCookies,
} from "./session";

describe("parseCookieString", () => {
  it("keeps values that contain equals signs", () => {
    const cookies = parseCookieString(
      "cf_clearance=abc=def; __Secure-next-auth.session-token=eyJ.abc; pplx.trackingAllowed=true",
    );
    assert.equal(cookies.cf_clearance, "abc=def");
    assert.equal(cookies["__Secure-next-auth.session-token"], "eyJ.abc");
    assert.equal(sessionTokenFromCookies(cookies), "eyJ.abc");
    assert.equal(looksLikeCookieJar("cf_clearance=abc; other=1"), true);
    assert.equal(looksLikeCookieJar("eyJhbGciOiJkaXIi"), false);
  });
});

describe("buildCookieHeader", () => {
  it("does not duplicate session cookies already in the jar", () => {
    const header = buildCookieHeader("token-a", {
      "__Secure-next-auth.session-token": "token-a",
      cf_clearance: "clear",
    });
    assert.equal(
      header,
      "__Secure-next-auth.session-token=token-a; cf_clearance=clear; next-auth.session-token=token-a",
    );
  });
});
