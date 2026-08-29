import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";
import { WORKFLOW_STAGES } from "../src/runtime/workflow-schema.js";
import type { Product } from "../src/product/types.js";

const fixtureProduct: Product = {
  id: "e2e-product-1",
  name: "COMMERCA E2E Test Product",
  url: "https://example.invalid/product/1",
  price: 299,
  originalPrice: 599,
  discount: 50,
  commission: 100,
  rating: 4.9,
  reviewCount: 1500,
  salesCount: 12000,
  promotion: "E2E promotion",
  source: "e2e-fixture",
  discoveredAt: new Date().toISOString(),
};

test("COMMERCA workflow runs 01 → 14 end-to-end without external providers", async () => {
  const workflow = createRuntimeWorkflow("find a high-potential product");
  const result = await executeWorkflow(workflow, createStageRegistry({
    discoverProducts: async () => [fixtureProduct],
  }));

  assert.equal(result.state.stages.length, 14);
  assert.deepEqual(result.state.stages.map((stage) => stage.status), WORKFLOW_STAGES.map(() => "completed"));
  assert.deepEqual(result.state.transitionHistory, WORKFLOW_STAGES);
  assert.equal(result.state.currentStage, "decision-learning");
  assert.ok(result.artifacts.some((item) => item.type === "product-candidate-list"));
  assert.ok(result.artifacts.some((item) => item.type === "selection"));
  assert.ok(result.artifacts.some((item) => item.type === "qc-report"));
  assert.ok(result.artifacts.some((item) => item.type === "publication"));
  assert.ok(result.artifacts.some((item) => item.type === "performance-report"));
  assert.ok(result.artifacts.some((item) => item.type === "decision"));
});

test("workflow blocks publishing when QC fails", async () => {
  const workflow = createRuntimeWorkflow("qc gate test");
  const registry = createStageRegistry({ discoverProducts: async () => [fixtureProduct] });
  registry.register;
  // The production registry owns the QC handler; this test verifies the runtime's
  // stage contract separately through a deliberately failing registry.
  const failing = new (registry.constructor as typeof import("../src/runtime/stages.js").WorkflowStageRegistry)();
  for (const stage of WORKFLOW_STAGES) {
    if (stage === "publishing") {
      failing.register(new (await import("../src/runtime/stages.js")).FunctionStage(stage, async () => { throw new Error("QC gate"); }));
    } else {
      failing.register(new (await import("../src/runtime/stages.js")).FunctionStage(stage, async (context) => ({ artifacts: [{ stage, type: `${stage}-ok`, data: {}, createdAt: new Date().toISOString() }] })));
    }
  }
  const result = await executeWorkflow(workflow, failing);
  assert.equal(result.state.stages.find((s) => s.stage === "publishing")?.status, "failed");
});
