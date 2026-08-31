import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { continueWorkflow } from "../src/runtime/index.js";
import { FunctionStage, WorkflowStageRegistry } from "../src/runtime/stages.js";
import { WORKFLOW_STAGES } from "../src/runtime/workflow-schema.js";
import type { Product } from "../src/product/types.js";

process.env.COMMERCA_USE_MOCK_CONTENT = "1";
process.env.COMMERCA_MODE = "test";

const product: Product = { id: "approval-product", name: "Approval Gate Product", image: "fixture://image", url: "https://example.invalid/product", price: 100, originalPrice: 200, discount: 50, source: "test", discoveredAt: new Date().toISOString() };

function approvalFixtureRegistry(): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) {
    registry.register(new FunctionStage(stage, async () => ({
      artifacts: [{
        stage,
        type: stage === "qc" ? "qc-report" : stage === "final-package" ? "final-package" : `${stage}-ok`,
        data: stage === "qc" ? { passed: true, issues: [] } : {},
        createdAt: new Date().toISOString(),
      }],
    })));
  }
  return registry;
}

test("QC passes then workflow pauses for explicit approval", async () => {
  const result = await executeWorkflow(createRuntimeWorkflow(product.name), approvalFixtureRegistry(), { pauseAfterQc: true });
  assert.equal(result.state.status, "awaiting-approval");
  assert.equal(result.state.currentStage, "qc");
  assert.equal(result.state.stages.find(s => s.stage === "qc")?.status, "completed");
  assert.equal(result.state.stages.find(s => s.stage === "final-package")?.status, "pending");
  assert.ok(result.artifacts.some(a => a.type === "approval-request"));
});

test("approved workflow continues from QC without rerunning QC", async () => {
  const workflow = await executeWorkflow(createRuntimeWorkflow(product.name), approvalFixtureRegistry(), { pauseAfterQc: true });
  assert.equal(workflow.state.status, "awaiting-approval");
  const beforeQcAttempts = workflow.state.stages.find(s => s.stage === "qc")?.attempts;
  const continued = await continueWorkflow(workflow, product);
  assert.equal(continued.state.status, "completed");
  assert.equal(continued.state.currentStage, "final-package");
  assert.equal(continued.state.stages.find(s => s.stage === "qc")?.attempts, beforeQcAttempts);
  assert.ok(continued.state.approval?.approvedAt);
});
