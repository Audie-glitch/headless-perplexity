import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("cookie jar hydration contract", () => {
  it("server snapshot is always empty so the first paint cannot read sessionStorage", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./use-cookie-jar.ts", import.meta.url), "utf8"),
    );
    assert.match(source, /useSyncExternalStore\(subscribe, readPersisted, \(\) => ""\)/);
    assert.doesNotMatch(source, /typeof window/);
  });
});
