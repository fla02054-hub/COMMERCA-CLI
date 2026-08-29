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

test("COMMERCA workflow completes all 14 stages without external providers", async () => {
  const result = await executeWorkflow(createRuntimeWorkflow("find a high-potential product"), createStageRegistry({ discoverProducts: async () => [fixtureProduct] }));
  assert.equal(result.state.status, "completed");
  assert.equal(result.state.stages.length, 14);
  assert.deepEqual(result.state.stages.map((s) => s.status), WORKFLOW_STAGES.map(() => "completed"));
  assert.deepEqual(result.state.transitionHistory, WORKFLOW_STAGES);
  assert.equal(result.state.currentStage, "decision-learning");
  assert.ok(result.state.stages.at(-1)?.completedAt);
  for (const type of ["goal", "product-candidate-list", "product-profile", "market-evidence", "product-analysis", "scorecard", "selection", "content-package", "creative-strategy", "production-package", "qc-report", "publication", "performance-report", "decision"]) {
    assert.ok(result.artifacts.some((item) => item.type === type), `missing artifact: ${type}`);
  }
});

test("runtime retries a failed stage and marks the workflow failed", async () => {
  const registry = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) registry.register(new FunctionStage(stage, async () => {
    if (stage === "product-discovery") throw new Error("fixture failure");
    return { artifacts: [{ stage, type: `${stage}-ok`, data: {}, createdAt: new Date().toISOString() }] };
  }));
  const result = await executeWorkflow(createRuntimeWorkflow("retry test"), registry);
  const failed = result.state.stages.find((s) => s.stage === "product-discovery");
  assert.equal(result.state.status, "failed");
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.attempts, 2);
});

test("QC failure stops the workflow before publishing", async () => {
  const registry = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) registry.register(new FunctionStage(stage, async () => {
    if (stage === "qc") return { artifacts: [{ stage, type: "qc-report", data: { passed: false, issues: ["fixture"] }, createdAt: new Date().toISOString() }] };
    return { artifacts: [{ stage, type: `${stage}-ok`, data: {}, createdAt: new Date().toISOString() }] };
  }));
  const result = await executeWorkflow(createRuntimeWorkflow("qc gate test"), registry);
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.stages.find((s) => s.stage === "qc")?.status, "failed");
  assert.equal(result.state.stages.find((s) => s.stage === "publishing")?.status, "pending");
  assert.equal(result.state.transitionHistory.at(-1), "qc");
  assert.equal(result.artifacts.some((item) => item.type === "publication"), false);
});

test("successful workflow has an explicit terminal state and no transition past stage 14", async () => {
  const registry = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) registry.register(new FunctionStage(stage, async () => ({
    artifacts: [{ stage, type: `${stage}-ok`, data: {}, createdAt: new Date().toISOString() }],
  })));
  const result = await executeWorkflow(createRuntimeWorkflow("terminal test"), registry);
  assert.equal(result.state.status, "completed");
  assert.equal(result.state.currentStage, "decision-learning");
  assert.deepEqual(result.state.transitionHistory, WORKFLOW_STAGES);
  assert.equal(result.state.transitionHistory.length, 14);
});
