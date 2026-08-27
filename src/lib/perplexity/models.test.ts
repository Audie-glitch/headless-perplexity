import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { officialModelFor, resolveModel } from "./models";

describe("resolveModel", () => {
  it("resolves mode aliases and custom identifiers", () => {
    assert.equal(resolveModel(undefined, "research").id, "perplexity/deep-research");
    assert.equal(resolveModel(undefined, "auto").mode, "concise");
    assert.equal(resolveModel("custom:my_model").identifier, "my_model");
  });

  it("maps unofficial models onto official Sonar ids", () => {
    assert.equal(officialModelFor(resolveModel("perplexity/best")), "sonar");
    assert.equal(officialModelFor(resolveModel("perplexity/pro")), "sonar-pro");
    assert.equal(officialModelFor(resolveModel("perplexity/reasoning")), "sonar-reasoning");
    assert.equal(officialModelFor(resolveModel("perplexity/deep-research")), "sonar-deep-research");
  });
});
