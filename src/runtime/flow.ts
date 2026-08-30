import { createWorkflowBlueprint, STAGE_ORDER, WORKFLOW_STAGES, type WorkflowBlueprint, type WorkflowStage } from "./workflow-schema.js";
import type { WorkflowArtifact } from "./workflow-schema.js";
import { WorkflowStageRegistry } from "./stages.js";
import type { StageContext } from "./stage-contract.js";

export interface RuntimeWorkflow { id: string; goal: string; state: WorkflowBlueprint; artifacts: WorkflowArtifact[]; }
export interface ExecuteWorkflowOptions { pauseAfterQc?: boolean; }

const ALLOWED_TRANSITIONS: Record<WorkflowStage, readonly WorkflowStage[]> = {
  goal: ["product-input"], "product-input": ["product-analysis"], "product-analysis": ["product-scoring"],
  "product-scoring": ["product-selection"], "product-selection": ["content-strategy"], "content-strategy": ["creative-strategy"],
  "creative-strategy": ["production"], production: ["qc"], qc: ["publishing", "creative-strategy", "production", "content-strategy"],
  publishing: ["performance"], performance: ["decision-learning"], "decision-learning": ["content-strategy"],
};

export function createRuntimeWorkflow(goal: string, id = crypto.randomUUID()): RuntimeWorkflow {
  if (!goal.trim()) throw new Error("Workflow goal is required.");
  return { id, goal: goal.trim(), state: createWorkflowBlueprint(), artifacts: [] };
}
function transitionAllowed(from: WorkflowStage, to: WorkflowStage): boolean { return ALLOWED_TRANSITIONS[from].includes(to); }
function resetForRevision(workflow: RuntimeWorkflow, from: WorkflowStage): void {
  const fromIndex = STAGE_ORDER[from];
  for (const state of workflow.state.stages) if (STAGE_ORDER[state.stage] >= fromIndex) {
    state.status = "pending"; delete state.startedAt; delete state.completedAt; delete state.error;
  }
}
function qcFailed(resultArtifacts: WorkflowArtifact[]): boolean {
  const report = resultArtifacts.find((item) => item.type === "qc-report")?.data;
  return typeof report === "object" && report !== null && "passed" in report && (report as { passed?: unknown }).passed === false;
}

export async function executeWorkflow(workflow: RuntimeWorkflow, registry: WorkflowStageRegistry, options: ExecuteWorkflowOptions = {}): Promise<RuntimeWorkflow> {
  const pauseAfterQc = options.pauseAfterQc ?? false;
  let stage = workflow.state.currentStage; let guard = 0;
  while (guard++ < 100) {
    const state = workflow.state.stages[STAGE_ORDER[stage] - 1];
    if (!state) throw new Error(`Missing workflow state for stage: ${stage}`);
    if (state.status === "completed" || state.status === "skipped") {
      if (stage === "qc" && pauseAfterQc && workflow.state.status === "awaiting-approval") return workflow;
      const next = WORKFLOW_STAGES[STAGE_ORDER[stage]];
      if (!next) { workflow.state.status = "completed"; return workflow; }
      stage = next; continue;
    }
    workflow.state.currentStage = stage; workflow.state.transitionHistory.push(stage);
    state.status = "running"; state.attempts += 1; state.startedAt = new Date().toISOString();
    try {
      const context: StageContext = { workflowId: workflow.id, goal: workflow.goal, stage, artifacts: workflow.artifacts };
      const result = await registry.get(stage).execute(context);
      workflow.artifacts.push(...result.artifacts); state.artifactTypes.push(...result.artifacts.map((item) => item.type));
      if (stage === "qc" && qcFailed(result.artifacts) && !result.nextStage) {
        state.status = "failed"; state.error = "QC failed; revision is required before publishing."; workflow.state.status = "failed"; return workflow;
      }
      state.status = "completed"; state.completedAt = new Date().toISOString(); delete state.error;
      if (stage === "qc" && pauseAfterQc) {
        workflow.state.currentStage = "qc";
        workflow.state.status = "awaiting-approval";
        workflow.state.approval = { requestedAt: new Date().toISOString() };
        workflow.artifacts.push({ stage: "qc", type: "approval-request", data: { status: "pending", message: "QC passed. Review the final package, then approve to continue publishing." }, createdAt: new Date().toISOString() });
        return workflow;
      }
      const next = result.nextStage ?? WORKFLOW_STAGES[STAGE_ORDER[stage]];
      if (!next) { workflow.state.currentStage = stage; workflow.state.status = "completed"; return workflow; }
      if (!transitionAllowed(stage, next)) throw new Error(`Invalid workflow transition: ${stage} -> ${next}`);
      if (STAGE_ORDER[next] <= STAGE_ORDER[stage]) resetForRevision(workflow, next);
      stage = next;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      if (state.attempts < workflow.state.maxAttemptsPerStage) { state.status = "pending"; continue; }
      state.status = "failed"; workflow.state.status = "failed"; return workflow;
    }
  }
  workflow.state.status = "failed"; throw new Error("Workflow transition guard exceeded 100 iterations.");
}
