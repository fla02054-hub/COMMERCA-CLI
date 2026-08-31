export type { WorkflowStage, WorkflowArtifact, WorkflowBlueprint, StageStatus, WorkflowStatus } from "./workflow-schema.js";
export { WORKFLOW_STAGES, STAGE_ORDER, createWorkflowBlueprint } from "./workflow-schema.js";
export type { StageContext, StageResult, WorkflowStageHandler } from "./stage-contract.js";
export { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
export { createStageRegistry } from "./stage-registry.js";
export { createRuntimeWorkflow, executeWorkflow, reopenForAutonomousCycle } from "./flow.js";
export type { RuntimeWorkflow, ExecuteWorkflowOptions } from "./flow.js";
export { runAutonomousAgent, resumeAutonomousAgent } from "./autonomous-agent.js";
export type { AutonomousAgentOptions, AutonomousAgentResult } from "./autonomous-agent.js";

import { STAGE_ORDER } from "./workflow-schema.js";
import { createRuntimeWorkflow, executeWorkflow, type RuntimeWorkflow, type ExecuteWorkflowOptions } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { Product } from "../product/types.js";

export async function runWorkflowWithProduct(goal: string, product: Product, options?: ExecuteWorkflowOptions): Promise<RuntimeWorkflow> {
  const workflow = createRuntimeWorkflow(goal);
  const registry = createStageRegistry({ product, outputDir: options?.outputDir, outputMp4: options?.outputMp4 });
  return executeWorkflow(workflow, registry, options);
}

export async function continueWorkflow(workflow: RuntimeWorkflow, product: Product, options?: ExecuteWorkflowOptions): Promise<RuntimeWorkflow> {
  if (workflow.state.status !== "awaiting-approval" || workflow.state.currentStage !== "qc") throw new Error("Workflow is not waiting for QC approval.");
  const qcState = workflow.state.stages[STAGE_ORDER.qc - 1];
  if (!qcState || qcState.status !== "completed") throw new Error("Cannot approve workflow before QC is completed.");
  workflow.state.approval = { ...(workflow.state.approval ?? { requestedAt: new Date().toISOString() }), approvedAt: new Date().toISOString() };
  workflow.state.status = "running";
  // QC is already completed. Resume directly at final-package; never rerun QC.
  workflow.state.currentStage = "final-package";
  const registry = createStageRegistry({ product, outputDir: options?.outputDir, outputMp4: options?.outputMp4 });
  return executeWorkflow(workflow, registry, options);
}
