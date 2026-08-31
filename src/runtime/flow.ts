import { createWorkflowBlueprint, STAGE_ORDER, WORKFLOW_STAGES, type WorkflowBlueprint, type WorkflowStage } from "./workflow-schema.js";
import type { WorkflowArtifact } from "./workflow-schema.js";
import { WorkflowStageRegistry } from "./stages.js";
import type { StageContext } from "./stage-contract.js";

export interface RuntimeWorkflow { id: string; goal: string; state: WorkflowBlueprint; artifacts: WorkflowArtifact[]; }
export interface AgentNextDecision { action?: "continue" | "revise" | "stop" | "publish" | "optimize"; nextStage?: WorkflowStage; reason?: string; confidence?: number; }
export interface ExecuteWorkflowOptions { pauseAfterQc?: boolean; outputDir?: string; outputMp4?: string; autonomous?: boolean; maxAutonomousRevisions?: number; decideNextStage?: (stage: WorkflowStage, workflow: RuntimeWorkflow) => Promise<AgentNextDecision>; }

const ALLOWED_TRANSITIONS: Record<WorkflowStage, readonly WorkflowStage[]> = {
  "product-input": ["product-analysis"],
  "product-analysis": ["content-creative"],
  "content-creative": ["production"],
  production: ["qc"],
  qc: ["final-package", "production", "content-creative"],
  "final-package": [],
};

const AUTONOMOUS_REVISION_STAGES: Record<WorkflowStage, readonly WorkflowStage[]> = {
  "product-input": [],
  "product-analysis": ["product-input"],
  "content-creative": ["product-analysis"],
  production: ["content-creative", "product-analysis"],
  qc: ["production", "content-creative", "product-analysis"],
  "final-package": ["qc", "production", "content-creative"],
};

const workflowRegistries = new WeakMap<RuntimeWorkflow, WorkflowStageRegistry>();

export function getWorkflowRegistry(workflow: RuntimeWorkflow): WorkflowStageRegistry | undefined { return workflowRegistries.get(workflow); }

export function createRuntimeWorkflow(goal: string, id = crypto.randomUUID()): RuntimeWorkflow {
  if (!goal.trim()) throw new Error("Workflow goal is required.");
  return { id, goal: goal.trim(), state: createWorkflowBlueprint(), artifacts: [] };
}
function transitionAllowed(from: WorkflowStage, to: WorkflowStage): boolean { return ALLOWED_TRANSITIONS[from].includes(to); }
function autonomousRevisionAllowed(from: WorkflowStage, to: WorkflowStage): boolean { return AUTONOMOUS_REVISION_STAGES[from].includes(to); }
function resetForRevision(workflow: RuntimeWorkflow, from: WorkflowStage): void {
  const fromIndex = STAGE_ORDER[from];
  for (const state of workflow.state.stages) if (STAGE_ORDER[state.stage] >= fromIndex) {
    state.status = "pending"; delete state.startedAt; delete state.completedAt; delete state.error;
  }
}
function inferRepairStage(failedStage: WorkflowStage, error: string): WorkflowStage | undefined {
  const text = error.toLowerCase();
  if (failedStage === "production") return "content-creative";
  if (failedStage === "qc") {
    if (text.includes("voice script") || text.includes("subtitle script") || text.includes("content") || text.includes("hashtag") || text.includes("url") || text.includes("creative") || text.includes("storyboard")) return "content-creative";
    if (text.includes("video") || text.includes("image") || text.includes("voice") || text.includes("subtitle")) return "production";
  }
  return undefined;
}
export function reopenForAutonomousCycle(workflow: RuntimeWorkflow, startStage: WorkflowStage = "content-creative"): RuntimeWorkflow {
  if (workflow.state.status !== "completed" && workflow.state.status !== "failed") return workflow;
  resetForRevision(workflow, startStage); workflow.state.status = "running"; workflow.state.currentStage = startStage; workflow.state.approval = undefined;
  workflow.artifacts.push({ stage: startStage, type: "agent-reopened-cycle", data: { reason: "Autonomous agent is taking ownership of the next optimization cycle.", startStage }, createdAt: new Date().toISOString() });
  return workflow;
}
function qcReport(resultArtifacts: WorkflowArtifact[]): { passed?: unknown; revisionStage?: WorkflowStage } | undefined {
  const report = resultArtifacts.find((item) => item.type === "qc-report")?.data;
  return typeof report === "object" && report !== null ? report as { passed?: unknown; revisionStage?: WorkflowStage } : undefined;
}
function isTerminalStage(stage: WorkflowStage): boolean { return stage === "final-package"; }
function hasFinalPackage(workflow: RuntimeWorkflow): boolean { return workflow.artifacts.some((item) => item.stage === "final-package" && item.type === "final-package"); }
function markWorkflowCompleted(workflow: RuntimeWorkflow): void {
  if (!hasFinalPackage(workflow)) throw new Error("Workflow cannot be completed before a final-package artifact is produced.");
  workflow.state.currentStage = "final-package";
  workflow.state.status = "completed";
}

export async function executeWorkflow(workflow: RuntimeWorkflow, registry: WorkflowStageRegistry, options: ExecuteWorkflowOptions = {}): Promise<RuntimeWorkflow> {
  workflowRegistries.set(workflow, registry);
  const pauseAfterQc = options.pauseAfterQc ?? false; const autonomous = options.autonomous ?? false;
  const maxAutonomousRevisions = Math.max(0, options.maxAutonomousRevisions ?? 3); let autonomousRevisions = 0;
  let stage = workflow.state.currentStage; let guard = 0;
  while (guard++ < 100) {
    const state = workflow.state.stages[STAGE_ORDER[stage] - 1]; if (!state) throw new Error(`Missing workflow state for stage: ${stage}`);
    if (state.status === "completed" || state.status === "skipped") { if (stage === "qc" && pauseAfterQc && workflow.state.status === "awaiting-approval") return workflow; const next = WORKFLOW_STAGES[STAGE_ORDER[stage]]; if (!next) { markWorkflowCompleted(workflow); return workflow; } stage = next; continue; }
    workflow.state.currentStage = stage; workflow.state.transitionHistory.push(stage); state.status = "running"; state.attempts += 1; state.startedAt = new Date().toISOString();
    try {
      const context: StageContext = { workflowId: workflow.id, goal: workflow.goal, stage, artifacts: workflow.artifacts };
      const result = await registry.get(stage).execute(context); workflow.artifacts.push(...result.artifacts); state.artifactTypes.push(...result.artifacts.map((item) => item.type));
      const report = stage === "qc" ? qcReport(result.artifacts) : undefined;
      if (stage === "qc" && report?.passed === false && !result.nextStage) {
        const revisionStage = report.revisionStage && transitionAllowed("qc", report.revisionStage) ? report.revisionStage : "content-creative";
        if (autonomous && autonomousRevisions < maxAutonomousRevisions) { autonomousRevisions++; state.status = "completed"; state.completedAt = new Date().toISOString(); workflow.artifacts.push({ stage: "qc", type: "agent-decision", data: { action: "revise", revision: autonomousRevisions, nextStage: revisionStage, issues: [report] }, createdAt: new Date().toISOString() }); workflow.state.status = "running"; resetForRevision(workflow, revisionStage); stage = revisionStage; continue; }
        state.status = "failed"; state.error = "QC failed; revision is required before final package."; workflow.state.status = "failed"; return workflow;
      }
      state.status = "completed"; state.completedAt = new Date().toISOString(); delete state.error;
      if (stage === "qc" && pauseAfterQc) { workflow.state.currentStage = "qc"; workflow.state.status = "awaiting-approval"; workflow.state.approval = { requestedAt: new Date().toISOString() }; workflow.artifacts.push({ stage: "qc", type: "approval-request", data: { status: "pending", message: "QC passed. Review the package inputs, then approve to create the final package." }, createdAt: new Date().toISOString() }); return workflow; }
      let next = result.nextStage ?? WORKFLOW_STAGES[STAGE_ORDER[stage]];
      if (autonomous && options.decideNextStage) {
        const decision = await options.decideNextStage(stage, workflow);
        if (decision.action === "stop" && isTerminalStage(stage)) { markWorkflowCompleted(workflow); return workflow; }
        if (decision.action === "stop" && !isTerminalStage(stage)) {
          const forcedNext = WORKFLOW_STAGES[STAGE_ORDER[stage]];
          if (forcedNext) { next = forcedNext; workflow.artifacts.push({ stage, type: "agent-decision-override", data: { original: decision, action: "continue", nextStage: forcedNext, reason: "Non-terminal stage cannot stop the autonomous workflow." }, createdAt: new Date().toISOString() }); }
        }
        if (decision.nextStage && (transitionAllowed(stage, decision.nextStage) || ((decision.action === "revise" || decision.action === "optimize") && autonomousRevisionAllowed(stage, decision.nextStage)))) { if ((decision.action === "revise" || decision.action === "optimize") && autonomousRevisionAllowed(stage, decision.nextStage)) resetForRevision(workflow, decision.nextStage); next = decision.nextStage; }
      }
      if (!next) { workflow.state.currentStage = stage; workflow.state.status = isTerminalStage(stage) ? "completed" : "failed"; if (workflow.state.status === "completed") markWorkflowCompleted(workflow); return workflow; }
      if (!transitionAllowed(stage, next) && !(autonomous && autonomousRevisionAllowed(stage, next))) throw new Error(`Invalid workflow transition: ${stage} -> ${next}`);
      if (STAGE_ORDER[next] <= STAGE_ORDER[stage]) resetForRevision(workflow, next); stage = next;
    } catch (error) {
      state.error = error instanceof Error ? error.message : String(error);
      if (autonomous && options.decideNextStage && autonomousRevisions < maxAutonomousRevisions) {
        autonomousRevisions++; workflow.artifacts.push({ stage, type: "stage-failure", data: { stage, error: state.error, attempts: state.attempts }, createdAt: new Date().toISOString() });
        state.status = "failed"; workflow.state.status = "running";
        const decision = await options.decideNextStage(stage, workflow);
        const repairStage = decision.nextStage && autonomousRevisionAllowed(stage, decision.nextStage) ? decision.nextStage : inferRepairStage(stage, state.error);
        workflow.artifacts.push({ stage, type: "agent-failure-decision", data: { ...decision, failedStage: stage, repairStage, revision: autonomousRevisions }, createdAt: new Date().toISOString() });
        if (decision.action !== "stop" && repairStage && autonomousRevisionAllowed(stage, repairStage)) { resetForRevision(workflow, repairStage); stage = repairStage; continue; }
        workflow.state.status = "failed"; return workflow;
      }
      if (state.attempts < workflow.state.maxAttemptsPerStage) { state.status = "pending"; continue; }
      state.status = "failed"; workflow.state.status = "failed"; return workflow;
    }
  }
  workflow.state.status = "failed"; throw new Error("Workflow transition guard exceeded 100 iterations.");
}
