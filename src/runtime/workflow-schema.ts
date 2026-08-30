/** Direct-product COMMERCA workflow. One job carries one product. */
export const WORKFLOW_STAGES = [
  "goal", "product-input", "product-analysis", "product-scoring", "product-selection",
  "content-strategy", "creative-strategy", "production", "qc", "publishing", "performance", "decision-learning",
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type WorkflowStatus = "running" | "awaiting_approval" | "completed" | "failed";
export type DecisionKind = "winner" | "loser" | "optimize";
export interface GoalInput { text: string; }
export interface ProductInput { name: string; price: number; url: string; image: string; subId?: string; }
export interface ContentStrategy { angle: string; hook: string; copy: string; cta: string; }
export interface CreativeStrategy { image: unknown; video: unknown; storyboard: unknown; prompt: unknown; }
export interface ProductionPackage { image?: unknown; video?: unknown; voice?: unknown; subtitle?: unknown; editing?: unknown; }
export interface QCReport { passed: boolean; issues: string[]; revisionStage?: "creative-strategy" | "production" | "content-strategy"; }
export interface Publication { organic?: unknown; ads?: unknown; }
export interface PerformanceReport { reach?: number; ctr?: number; cpc?: number; conversion?: number; commission?: number; }
export interface DecisionLearning { kind: DecisionKind; reason: string; feedbackStage?: "content-strategy"; }
export interface WorkflowArtifact<T = unknown> { stage: WorkflowStage; type: string; data: T; createdAt: string; }
export interface WorkflowStageState { stage: WorkflowStage; status: StageStatus; attempts: number; startedAt?: string; completedAt?: string; error?: string; artifactTypes: string[]; }
export interface WorkflowBlueprint { version: 7; status: WorkflowStatus; stages: WorkflowStageState[]; currentStage: WorkflowStage; transitionHistory: WorkflowStage[]; maxAttemptsPerStage: number; }
export const STAGE_ORDER: Record<WorkflowStage, number> = Object.fromEntries(WORKFLOW_STAGES.map((stage, index) => [stage, index + 1])) as Record<WorkflowStage, number>;
export function createWorkflowBlueprint(maxAttemptsPerStage = 2): WorkflowBlueprint {
  return { version: 7, status: "running", currentStage: "goal", transitionHistory: [], maxAttemptsPerStage, stages: WORKFLOW_STAGES.map((stage) => ({ stage, status: "pending", attempts: 0, artifactTypes: [] })) };
}
