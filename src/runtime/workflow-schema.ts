/** Direct-product COMMERCA workflow. Stage-specific artifact models live in stage-artifacts.ts. */
export const WORKFLOW_STAGES = [
  "goal", "product-input", "product-analysis",
  "content-strategy", "creative-strategy", "production", "qc", "publishing", "final-package", "performance", "decision-learning",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type WorkflowStatus = "running" | "awaiting-approval" | "completed" | "failed";
export type DecisionKind = "winner" | "loser" | "optimize";

export interface GoalInput { text: string; }
export interface ProductInput { name: string; price: number; url: string; image: string; }
export interface WorkflowArtifact<T = unknown> { stage: WorkflowStage; type: string; data: T; createdAt: string; }
export interface WorkflowStageState {
  stage: WorkflowStage;
  status: StageStatus;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  artifactTypes: string[];
}
export interface WorkflowBlueprint {
  version: 7;
  status: WorkflowStatus;
  stages: WorkflowStageState[];
  currentStage: WorkflowStage;
  transitionHistory: WorkflowStage[];
  maxAttemptsPerStage: number;
  approval?: { requestedAt: string; approvedAt?: string };
}

export const STAGE_ORDER: Record<WorkflowStage, number> = Object.fromEntries(
  WORKFLOW_STAGES.map((stage, index) => [stage, index + 1]),
) as Record<WorkflowStage, number>;

export function createWorkflowBlueprint(maxAttemptsPerStage = 2): WorkflowBlueprint {
  return {
    version: 7,
    status: "running",
    currentStage: "goal",
    transitionHistory: [],
    maxAttemptsPerStage,
    stages: WORKFLOW_STAGES.map((stage) => ({
      stage,
      status: "pending",
      attempts: 0,
      artifactTypes: [],
    })),
  };
}
