import { WORKFLOW_STAGES } from "./workflow-schema.js";
import { WorkflowStageRegistry, FunctionStage } from "./stages.js";

/**
 * Registers every workflow stage up front. Implementations can be replaced
 * independently without changing the workflow order or runtime contract.
 */
export function createStageRegistry(): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();
  for (const stage of WORKFLOW_STAGES) {
    registry.register(new FunctionStage(stage, async () => ({ artifacts: [] })));
  }
  return registry;
}
