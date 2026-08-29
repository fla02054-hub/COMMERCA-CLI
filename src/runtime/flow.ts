import { createWorkflowBlueprint, STAGE_ORDER, WORKFLOW_STAGES, type WorkflowBlueprint, type WorkflowStage } from "./workflow-schema.js";
import type { WorkflowArtifact } from "./workflow-schema.js";
import { WorkflowStageRegistry } from "./stages.js";
import type { StageContext } from "./stage-contract.js";

export interface RuntimeWorkflow {
  id: string;
  goal: string;
  state: WorkflowBlueprint;
  artifacts: WorkflowArtifact[];
}

export function createRuntimeWorkflow(goal: string, id = crypto.randomUUID()): RuntimeWorkflow {
  if (!goal.trim()) throw new Error("Workflow goal is required.");
  return { id, goal: goal.trim(), state: createWorkflowBlueprint(), artifacts: [] };
}

export async function executeWorkflow(workflow: RuntimeWorkflow, registry: WorkflowStageRegistry): Promise<RuntimeWorkflow> {
  for (const stage of WORKFLOW_STAGES) {
    const state = workflow.state.stages[STAGE_ORDER[stage] - 1];
    if (state.status === "completed" || state.status === "skipped") continue;

    workflow.state.currentStage = stage;
    state.status = "running";
    state.attempts += 1;
    state.startedAt = new Date().toISOString();

    try {
      const context: StageContext = { workflowId: workflow.id, goal: workflow.goal, stage, artifacts: workflow.artifacts };
      const result = await registry.get(stage).execute(context);
      workflow.artifacts.push(...result.artifacts);
      state.artifactTypes.push(...result.artifacts.map((item) => item.type));
      state.status = "completed";
      state.completedAt = new Date().toISOString();
      if (result.nextStage) {
        const nextIndex = STAGE_ORDER[result.nextStage];
        if (nextIndex <= STAGE_ORDER[stage]) throw new Error(`Invalid workflow transition: ${stage} -> ${result.nextStage}`);
      }
    } catch (error) {
      state.status = "failed";
      state.error = error instanceof Error ? error.message : String(error);
      return workflow;
    }
  }

  workflow.state.currentStage = WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1] as WorkflowStage;
  return workflow;
}
