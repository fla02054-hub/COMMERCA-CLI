import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";
import { FunctionStage, WorkflowStageRegistry } from "../src/runtime/stages.js";
import { WORKFLOW_STAGES } from "../src/runtime/workflow-schema.js";
import type { Product } from "../src/product/types.js";

const fixtureProduct: Product = {
  id: "e2e-product-1", name: "COMMERCA E2E Test Product", url: "https://example.invalid/product/1",
  price: 299, originalPrice: 599, discount: 50, commission: 100, rating: 4.9,
  reviewCount: 1500, salesCount: 12000, promotion: "E2E promotion", source: "e2e-fixture",
  discoveredAt: new Date().toISOString(),
};

test("COMMERCA workflow runs 01 → 14 end-to-end without external providers", async () => {
  const workflow = createRuntimeWorkflow("find a high-potential product");
  const result = await executeWorkflow(workflow, createStageRegistry({ discoverProducts: async () => [fixtureProduct] }));
  assert.equal(result.state.stages.length, 14);
  assert.deepEqual(result.state.stages.map((stage) => stage.status), WORKFLOW_STAGES.map(() => "completed"));
  assert.deepEqual(result.state.transitionHistory, WORKFLOW_STAGES);
  assert.equal(result.state.currentStage, "decision-learning");
  for (const type of ["product-candidate-list", "product-profile", "market-evidence", "product-analysis", "scorecard", "selection", "content-package", "creative-strategy", "production-package", "qc-report", "publication", "performance-report", "decision"]) {
    assert.ok(result.artifacts.some((item) => item.type === type), `missing artifact: ${type}`);
  }
});

test("runtime retries a failed stage and then marks it failed", async () => {
  const registry = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) {
    registry.register(new FunctionStage(stage, async () => {
      if (stage === "product-discovery") throw new Error("fixture failure");
      return { artifacts: [{ stage, type: `${stage}-ok`, data: {}, createdAt: new Date().toISOString() }] };
    }));
  }
  const result = await executeWorkflow(createRuntimeWorkflow("retry test"), registry);
  const failed = result.state.stages.find((stage) => stage.stage === "product-discovery");
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.attempts, 2);
});
