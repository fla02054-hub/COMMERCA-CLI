import type { WorkflowArtifact, WorkflowStage } from "./workflow-schema.js";

export interface StageContext {
  workflowId: string;
  goal: string;
  stage: WorkflowStage;
  artifacts: WorkflowArtifact[];
}

export interface StageResult<T = unknown> {
  artifacts: WorkflowArtifact<T>[];
  nextStage?: WorkflowStage;
}

export interface WorkflowStageHandler<T = unknown> {
  readonly stage: WorkflowStage;
  execute(context: StageContext): Promise<StageResult<T>>;
}
