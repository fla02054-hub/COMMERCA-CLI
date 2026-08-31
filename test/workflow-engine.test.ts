import test from "node:test";
import assert from "node:assert/strict";
import { COMMERCA_WORKFLOW, ProviderRegistry } from "../src/runtime/workflow-engine.js";

test("COMMERCA exposes one n8n-style workflow graph", () => {
  assert.equal(COMMERCA_WORKFLOW.id, "commerca-product-workflow");
  assert.equal(COMMERCA_WORKFLOW.start, "product-input");
  assert.deepEqual(COMMERCA_WORKFLOW.nodes["product-input"].next, ["product-analysis"]);
  assert.deepEqual(COMMERCA_WORKFLOW.nodes["product-analysis"].next, ["content-creative"]);
  assert.deepEqual(COMMERCA_WORKFLOW.nodes["content-creative"].next, ["production"]);
  assert.deepEqual(COMMERCA_WORKFLOW.nodes.production.next, ["qc"]);
  assert.deepEqual(COMMERCA_WORKFLOW.nodes.qc.next, ["final-package", "production", "content-creative"]);
  assert.deepEqual(COMMERCA_WORKFLOW.nodes["final-package"].next, []);
});

test("provider registry keeps external providers independent from the workflow", async () => {
  const registry = new ProviderRegistry();
  registry.register({ id: "higgsfield", execute: async (input) => ({ provider: "higgsfield", input }) });
  assert.equal(registry.has("higgsfield"), true);
  assert.deepEqual(await registry.get("higgsfield").execute("video-prompt"), { provider: "higgsfield", input: "video-prompt" });
});
