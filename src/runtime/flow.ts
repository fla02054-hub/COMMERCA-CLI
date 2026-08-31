import { createWorkflowBlueprint, STAGE_ORDER, WORKFLOW_STAGES, type WorkflowBlueprint, type WorkflowStage, type WorkflowArtifact } from "./workflow-schema.js";
import { WorkflowStageRegistry } from "./stages.js";
import { WorkflowGraphEngine, type NodeDefinition } from "./graph-engine.js";

export interface RuntimeWorkflow { id: string; goal: string; state: WorkflowBlueprint; artifacts: WorkflowArtifact[]; }
export interface AgentNextDecision { action?: "continue" | "revise" | "stop" | "publish" | "optimize"; nextStage?: WorkflowStage; reason?: string; confidence?: number; }
export interface ExecuteWorkflowOptions { pauseAfterQc?: boolean; outputDir?: string; outputMp4?: string; autonomous?: boolean; maxAutonomousRevisions?: number; decideNextStage?: (stage: WorkflowStage, workflow: RuntimeWorkflow) => Promise<AgentNextDecision>; }

const workflowRegistries = new WeakMap<RuntimeWorkflow, WorkflowStageRegistry>();

export function getWorkflowRegistry(workflow: RuntimeWorkflow): WorkflowStageRegistry | undefined { return workflowRegistries.get(workflow); }
export function createRuntimeWorkflow(goal: string, id = crypto.randomUUID()): RuntimeWorkflow {
  if (!goal.trim()) throw new Error("Workflow goal is required.");
  return { id, goal: goal.trim(), state: createWorkflowBlueprint(), artifacts: [] };
}
function resetForRevision(workflow: RuntimeWorkflow, from: WorkflowStage): void {
  const fromIndex = STAGE_ORDER[from];
  for (const state of workflow.state.stages) if (STAGE_ORDER[state.stage] >= fromIndex) {
    state.status = "pending"; delete state.startedAt; delete state.completedAt; delete state.error;
  }
}
function qcReport(artifacts: WorkflowArtifact[]): { passed?: unknown; revisionStage?: WorkflowStage } | undefined {
  const report = artifacts.find(item => item.type === "qc-report")?.data;
  return typeof report === "object" && report !== null ? report as { passed?: unknown; revisionStage?: WorkflowStage } : undefined;
}
function hasFinalPackage(workflow: RuntimeWorkflow): boolean { return workflow.artifacts.some(item => item.stage === "final-package" && item.type === "final-package"); }
function markWorkflowCompleted(workflow: RuntimeWorkflow): void {
  if (!hasFinalPackage(workflow)) throw new Error("Workflow cannot be completed before a final-package artifact is produced.");
  workflow.state.currentStage = "final-package";
  workflow.state.status = "completed";
}

/** Build the executable graph from the workflow registry. The product graph is only the default graph; the engine itself is generic. */
export function createWorkflowGraph(registry: WorkflowStageRegistry): WorkflowGraphEngine {
  const graph = new WorkflowGraphEngine();
  for (let index = 0; index < WORKFLOW_STAGES.length; index++) {
    const stage = WORKFLOW_STAGES[index];
    const next = stage === "qc" ? ["final-package", "production", "content-creative"] : WORKFLOW_STAGES[index + 1] ? [WORKFLOW_STAGES[index + 1]] : [];
    const node: NodeDefinition = {
      id: stage,
      type: `commerca.${stage}`,
      next,
      retry: { maxAttempts: 1 },
      execute: async context => ({ output: await registry.get(stage).execute({ workflowId: context.executionId, goal: String(context.data.goal ?? ""), stage, artifacts: (context.data.artifacts as WorkflowArtifact[]) ?? [] }) }),
    };
    graph.register(node);
  }
  return graph;
}

export function reopenForAutonomousCycle(workflow: RuntimeWorkflow, startStage: WorkflowStage = "content-creative"): RuntimeWorkflow {
  if (workflow.state.status !== "completed" && workflow.state.status !== "failed") return workflow;
  resetForRevision(workflow, startStage); workflow.state.status = "running"; workflow.state.currentStage = startStage; workflow.state.approval = undefined;
  workflow.artifacts.push({ stage: startStage, type: "agent-reopened-cycle", data: { reason: "Autonomous agent is taking ownership of the next optimization cycle.", startStage }, createdAt: new Date().toISOString() });
  return workflow;
}

export async function executeWorkflow(workflow: RuntimeWorkflow, registry: WorkflowStageRegistry, options: ExecuteWorkflowOptions = {}): Promise<RuntimeWorkflow> {
  workflowRegistries.set(workflow, registry);
  const autonomous = options.autonomous ?? false;
  const pauseAfterQc = options.pauseAfterQc ?? false;
  const maxRevisions = Math.max(0, options.maxAutonomousRevisions ?? 3);
  let revisions = 0;
  let stage = workflow.state.currentStage;
  let guard = 0;

  while (guard++ < 100) {
    const state = workflow.state.stages.find(item => item.stage === stage);
    if (!state) throw new Error(`Missing workflow state for stage: ${stage}`);
    if (state.status === "completed" || state.status === "skipped") {
      if (stage === "qc" && workflow.state.status === "awaiting-approval") return workflow;
      const fallback = WORKFLOW_STAGES[STAGE_ORDER[stage]];
      if (!fallback) { markWorkflowCompleted(workflow); return workflow; }
      stage = fallback; continue;
    }

    workflow.state.currentStage = stage;
    workflow.state.transitionHistory.push(stage);
    state.status = "running";
    state.attempts += 1;
    state.startedAt = new Date().toISOString();

    const graph = createWorkflowGraph(registry);
    const graphResult = await graph.run({ goal: workflow.goal, artifacts: workflow.artifacts }, { startNode: stage, maxSteps: 1, chooseNext: async () => [] });
    const nodeError = graphResult.nodes[stage]?.error;
    if (graphResult.status === "failed" && nodeError) {
      state.error = nodeError;
      if (autonomous && options.decideNextStage && revisions < maxRevisions) {
        revisions++;
        workflow.artifacts.push({ stage, type: "stage-failure", data: { stage, error: nodeError, attempts: state.attempts }, createdAt: new Date().toISOString() });
        const decision = await options.decideNextStage(stage, workflow);
        const repair = decision.nextStage;
        workflow.artifacts.push({ stage, type: "agent-failure-decision", data: { ...decision, failedStage: stage, repairStage: repair, revision: revisions }, createdAt: new Date().toISOString() });
        if (decision.action !== "stop" && repair && graph.has(repair)) { state.status = "failed"; resetForRevision(workflow, repair); stage = repair; continue; }
      }
      if (state.attempts < workflow.state.maxAttemptsPerStage) { state.status = "pending"; continue; }
      state.status = "failed"; workflow.state.status = "failed"; return workflow;
    }

    const result = graphResult.outputs[stage] as { artifacts?: WorkflowArtifact[]; nextStage?: WorkflowStage } | undefined;
    const artifacts = result?.artifacts ?? [];
    workflow.artifacts.push(...artifacts);
    state.artifactTypes.push(...artifacts.map(item => item.type));
    state.status = "completed"; state.completedAt = new Date().toISOString(); delete state.error;

    const report = stage === "qc" ? qcReport(artifacts) : undefined;
    if (stage === "qc" && report?.passed === false) {
      const revisionStage = report.revisionStage && graph.has(report.revisionStage) ? report.revisionStage : "content-creative";
      if (autonomous && revisions < maxRevisions) {
        revisions++;
        workflow.artifacts.push({ stage: "qc", type: "agent-decision", data: { action: "revise", revision: revisions, nextStage: revisionStage, issues: [report] }, createdAt: new Date().toISOString() });
        resetForRevision(workflow, revisionStage); workflow.state.status = "running"; stage = revisionStage; continue;
      }
      state.status = "failed"; state.error = "QC failed; revision is required before final package."; workflow.state.status = "failed"; return workflow;
    }

    if (stage === "qc" && pauseAfterQc) {
      workflow.state.currentStage = "qc"; workflow.state.status = "awaiting-approval"; workflow.state.approval = { requestedAt: new Date().toISOString() };
      workflow.artifacts.push({ stage: "qc", type: "approval-request", data: { status: "pending", message: "QC passed. Review the package inputs, then approve to create the final package." }, createdAt: new Date().toISOString() });
      return workflow;
    }

    let next = result?.nextStage ?? WORKFLOW_STAGES[STAGE_ORDER[stage]];
    if (autonomous && options.decideNextStage) {
      const decision = await options.decideNextStage(stage, workflow);
      workflow.artifacts.push({ stage, type: "agent-decision", data: decision, createdAt: new Date().toISOString() });
      if (decision.action === "stop" && stage === "final-package") { markWorkflowCompleted(workflow); return workflow; }
      if (decision.nextStage && graph.has(decision.nextStage)) {
        if (decision.action === "revise" || decision.action === "optimize") resetForRevision(workflow, decision.nextStage);
        next = decision.nextStage;
      }
    }
    if (!next) { if (stage === "final-package") { markWorkflowCompleted(workflow); return workflow; } workflow.state.status = "failed"; return workflow; }
    if (STAGE_ORDER[next] <= STAGE_ORDER[stage]) resetForRevision(workflow, next);
    stage = next;
  }
  workflow.state.status = "failed";
  throw new Error("Workflow transition guard exceeded 100 iterations.");
}
