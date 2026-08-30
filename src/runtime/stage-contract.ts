import type { GoalInput, ContentStrategy, CreativeStrategy, DecisionLearning, PerformanceReport, ProductionPackage, Publication, QCReport, WorkflowArtifact, WorkflowStage } from "./workflow-schema.js";

export interface StageArtifactMap {
  goal: GoalInput;
  "content-strategy": ContentStrategy;
  "creative-strategy": CreativeStrategy;
  production: ProductionPackage;
  qc: QCReport;
  publishing: Publication;
  performance: PerformanceReport;
  "decision-learning": DecisionLearning;
}
export interface StageContext { workflowId: string; goal: string; stage: WorkflowStage; artifacts: WorkflowArtifact[]; }
export interface StageResult<T = unknown> { artifacts: WorkflowArtifact<T>[]; nextStage?: WorkflowStage; }
export interface WorkflowStageHandler<T = unknown> { readonly stage: WorkflowStage; execute(context: StageContext): Promise<StageResult<T>>; }
