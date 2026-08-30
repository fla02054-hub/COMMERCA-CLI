export type { WorkflowStage, WorkflowArtifact, WorkflowBlueprint, StageStatus } from "./workflow-schema.js";
export { WORKFLOW_STAGES, STAGE_ORDER, createWorkflowBlueprint } from "./workflow-schema.js";
export type { StageContext, StageResult, WorkflowStageHandler } from "./stage-contract.js";
export { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
export { createStageRegistry } from "./stage-registry.js";
export { createRuntimeWorkflow, executeWorkflow } from "./flow.js";
export type { RuntimeWorkflow } from "./flow.js";

import { createRuntimeWorkflow, executeWorkflow, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import { searchRakatookyangProduct } from "../product/index.js";

const URL_PATTERN = /https?:\/\/\S+/i;

function productUrlFromGoal(goal: string): string | undefined {
  return goal.match(URL_PATTERN)?.[0]?.replace(/[),.!?]+$/g, "");
}

/** Single public entry point for the 14-stage COMMERCA workflow. */
export async function runWorkflow(goal: string): Promise<RuntimeWorkflow> {
  const workflow = createRuntimeWorkflow(goal);
  const productUrl = productUrlFromGoal(workflow.goal);
  const registry = productUrl
    ? createStageRegistry({ discoverProducts: async () => [await searchRakatookyangProduct(productUrl)] })
    : createStageRegistry();
  return executeWorkflow(workflow, registry);
}
