import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCookieHeader,
  inspectCookieJar,
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

describe("inspectCookieJar", () => {
  it("prefers a full jar over a bare session token", () => {
    const full = inspectCookieJar(
      "cf_clearance=clear; __Secure-next-auth.session-token=eyJ.abc; __cf_bm=bot",
    );
    assert.equal(full.kind, "full");
    assert.equal(full.hasSession, true);
    assert.equal(full.hasClearance, true);
    assert.equal(inspectCookieJar("eyJhbGciOiJkaXIi").kind, "session-token");
    assert.equal(inspectCookieJar("").kind, "empty");
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
