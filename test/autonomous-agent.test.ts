import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { FunctionStage, WorkflowStageRegistry } from "../src/runtime/stages.js";
import { WORKFLOW_STAGES } from "../src/runtime/workflow-schema.js";

test("autonomous supervisor revises after QC failure and completes", async () => {
  const registry = new WorkflowStageRegistry();
  let qcRuns = 0;
  for (const stage of WORKFLOW_STAGES) {
    registry.register(new FunctionStage(stage, async () => {
      if (stage === "qc") {
        qcRuns += 1;
        return { artifacts: [{ stage, type: "qc-report", data: qcRuns === 1 ? { passed: false, issues: ["content title is missing"], revisionStage: "content-creative" } : { passed: true, issues: [] }, createdAt: new Date().toISOString() }] };
      }
      if (stage === "final-package") {
        return { artifacts: [{ stage, type: "final-package", data: { run: 1 }, createdAt: new Date().toISOString() }] };
      }
      return { artifacts: [{ stage, type: `${stage}-ok`, data: { run: stage === "content-creative" ? qcRuns : 1 }, createdAt: new Date().toISOString() }] };
    }));
  }

  const result = await executeWorkflow(createRuntimeWorkflow("autonomous test"), registry, {
    autonomous: true,
    maxAutonomousRevisions: 2,
  });

  assert.equal(result.state.status, "completed");
  assert.equal(qcRuns, 2);
  assert.equal(result.state.currentStage, "final-package");
  assert.ok(result.artifacts.some((item) => item.type === "agent-decision"));
  assert.ok(result.artifacts.some((item) => item.stage === "final-package" && item.type === "final-package"));
  assert.equal(result.state.stages.find((stage) => stage.stage === "final-package")?.status, "completed");
});

test("autonomous supervisor stops after revision budget", async () => {
  const registry = new WorkflowStageRegistry();
  let qcRuns = 0;
  for (const stage of WORKFLOW_STAGES) {
    registry.register(new FunctionStage(stage, async () => {
      if (stage === "qc") {
        qcRuns += 1;
        return { artifacts: [{ stage, type: "qc-report", data: { passed: false, issues: ["missing final video"], revisionStage: "production" }, createdAt: new Date().toISOString() }] };
      }
      return { artifacts: [{ stage, type: `${stage}-ok`, data: {}, createdAt: new Date().toISOString() }] };
    }));
  }

  const result = await executeWorkflow(createRuntimeWorkflow("autonomous budget test"), registry, {
    autonomous: true,
    maxAutonomousRevisions: 1,
  });

  assert.equal(result.state.status, "failed");
  assert.equal(qcRuns, 2);
});
