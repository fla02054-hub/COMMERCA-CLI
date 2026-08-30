import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { FunctionStage, WorkflowStageRegistry } from "../src/runtime/stages.js";
import { WORKFLOW_STAGES } from "../src/runtime/workflow-schema.js";

function registry(): WorkflowStageRegistry {
  const r = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) {
    r.register(new FunctionStage(stage, async () => ({
      artifacts: [{ stage, type: stage === "qc" ? "qc-report" : `${stage}-ok`, data: stage === "qc" ? { passed: true, issues: [] } : {}, createdAt: new Date().toISOString() }],
    })));
  }
  return r;
}

test("QC approval gate stops exactly once after QC", async () => {
  const workflow = await executeWorkflow(createRuntimeWorkflow("approval gate"), registry(), { stopAfterQc: true });
  assert.equal(workflow.state.status, "awaiting_approval");
  assert.equal(workflow.state.currentStage, "qc");
  assert.equal(workflow.state.stages.find(s => s.stage === "qc")?.status, "completed");
  assert.equal(workflow.state.stages.find(s => s.stage === "publishing")?.status, "pending");
  assert.equal(workflow.state.transitionHistory.at(-1), "qc");
  assert.equal(workflow.state.transitionHistory.filter(s => s === "qc").length, 1);
});

test("approved workflow resumes at publishing and reaches learning", async () => {
  const workflow = await executeWorkflow(createRuntimeWorkflow("approval resume"), registry(), { stopAfterQc: true });
  workflow.state.status = "running";
  workflow.state.currentStage = "publishing";
  const result = await executeWorkflow(workflow, registry());
  assert.equal(result.state.status, "completed");
  assert.equal(result.state.currentStage, "decision-learning");
  assert.equal(result.state.transitionHistory.at(-1), "decision-learning");
  assert.equal(result.state.stages.find(s => s.stage === "publishing")?.status, "completed");
  assert.equal(result.state.stages.find(s => s.stage === "performance")?.status, "completed");
});

test("QC failure never reaches approval or publishing", async () => {
  const r = registry();
  r.register(new FunctionStage("qc", async () => ({ artifacts: [{ stage: "qc", type: "qc-report", data: { passed: false, issues: ["bad media"] }, createdAt: new Date().toISOString() }] })));
  const result = await executeWorkflow(createRuntimeWorkflow("qc failure"), r, { stopAfterQc: true });
  assert.equal(result.state.status, "failed");
  assert.equal(result.state.stages.find(s => s.stage === "publishing")?.status, "pending");
});
