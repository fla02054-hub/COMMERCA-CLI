/**
 * COMMERCA workflow blueprint.
 *
 * This file defines the complete stage contract before implementation of
 * downstream automation. Stages are intentionally provider-agnostic.
 */
export const WORKFLOW_STAGES = [
  "goal",
  "product-discovery",
  "product-research",
  "market-research",
  "product-analysis",
  "product-scoring",
  "product-selection",
  "content-strategy",
  "creative-strategy",
  "production",
  "qc",
  "publishing",
  "performance",
  "decision-learning",
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface WorkflowArtifact<T = unknown> {
  stage: WorkflowStage;
  type: string;
  data: T;
  createdAt: string;
}

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
  version: 1;
  stages: WorkflowStageState[];
  currentStage: WorkflowStage;
}

export const STAGE_ORDER: Record<WorkflowStage, number> = Object.fromEntries(
  WORKFLOW_STAGES.map((stage, index) => [stage, index + 1]),
) as Record<WorkflowStage, number>;

export function createWorkflowBlueprint(): WorkflowBlueprint {
  return {
    version: 1,
    currentStage: "goal",
    stages: WORKFLOW_STAGES.map((stage) => ({
      stage,
      status: "pending",
      attempts: 0,
      artifactTypes: [],
    })),
  };
}
