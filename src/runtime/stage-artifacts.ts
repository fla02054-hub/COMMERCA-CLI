import type { WorkflowArtifact, WorkflowStage } from "./workflow-schema.js";

export interface CreativeStrategy {
  image: string[];
  video: string[];
  storyboard: string[];
  prompt: string[];
}

export interface ProductionPackage {
  image?: unknown;
  video?: unknown;
  voice?: unknown;
  subtitle?: unknown;
  editing?: unknown;
}

export interface FinalContentPackage {
  product: unknown;
  content: unknown;
  creative: CreativeStrategy;
  production: ProductionPackage;
  qc: QcReport;
  publish: PublicationRecord;
}

export interface QcReport {
  passed: boolean;
  issues: string[];
}

export interface PublicationRecord {
  organic?: unknown;
  ads?: unknown;
  finalPackage?: FinalContentPackage;
}

export interface PerformanceReport {
  reach: number;
  ctr: number;
  cpc: number;
  conversion: number;
  commission: number;
}

export interface DecisionLearning {
  outcome: "winner" | "loser" | "optimize";
  actions: string[];
  feedbackStage?: "product-research" | "content-strategy";
}

export type TypedStageArtifact =
  | WorkflowArtifact<{ text: string }>
  | WorkflowArtifact<CreativeStrategy>
  | WorkflowArtifact<ProductionPackage>
  | WorkflowArtifact<FinalContentPackage>
  | WorkflowArtifact<QcReport>
  | WorkflowArtifact<PublicationRecord>
  | WorkflowArtifact<PerformanceReport>
  | WorkflowArtifact<DecisionLearning>;

export function typedArtifact<T>(stage: WorkflowStage, type: string, data: T): WorkflowArtifact<T> {
  return { stage, type, data, createdAt: new Date().toISOString() };
}
