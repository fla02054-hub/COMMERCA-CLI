export type { WorkflowStage, WorkflowArtifact, WorkflowBlueprint, StageStatus } from "./workflow-schema.js";
export { WORKFLOW_STAGES, STAGE_ORDER, createWorkflowBlueprint } from "./workflow-schema.js";
export type { StageContext, StageResult, WorkflowStageHandler } from "./stage-contract.js";
export { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
export { createStageRegistry } from "./stage-registry.js";
export { createRuntimeWorkflow, executeWorkflow } from "./flow.js";
export type { RuntimeWorkflow } from "./flow.js";

import { createRuntimeWorkflow, executeWorkflow, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { Product } from "../product/types.js";

/** Run the 14-stage workflow using a product supplied directly by the user. */
export async function runWorkflowWithProduct(goal: string, product: Product): Promise<RuntimeWorkflow> {
  const workflow = createRuntimeWorkflow(goal);
  const registry = createStageRegistry({ product });
  return executeWorkflow(workflow, registry);
}
