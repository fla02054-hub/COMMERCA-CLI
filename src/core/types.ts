export type NodeName = "PRODUCT" | "ANALYSIS" | "CONTENT" | "PRODUCTION" | "POST" | "POST ANALYSIS";
export type JobStatus = "queued" | "running" | "waiting" | "completed" | "failed";
export type NodeExecutionStatus = "idle" | "running" | "completed" | "failed";

export interface ProductInput {
  name: string;
  price?: number;
  originalPrice?: number;
  url?: string;
  image?: string;
  source?: string;
  [key: string]: unknown;
}

export interface ProductData extends ProductInput {
  id: string;
  discountPercent: number;
  receivedAt: string;
}

export interface AnalysisData {
  category: string;
  audience: string[];
  problems: string[];
  benefits: string[];
  sellingPoints: string[];
}

export interface ContentData {
  hook: string;
  angle: string;
  story: string;
  caption: string;
  cta: string;
}

export interface ProductionData {
  imagePrompt: string;
  videoPrompt: string;
  scenes: string[];
}

export interface PostData {
  platform: string;
  status: "ready" | "posted" | "failed";
  postId?: string;
  postUrl?: string;
  error?: string;
  idempotencyKey?: string;
}

export interface PostAnalysisData {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  orders: number;
  ctr: number;
  engagementRate: number;
  score: number;
  nextAction: string;
}

export type NodePayload = Record<string, unknown>;

export interface NodePort {
  name: string;
}

export interface NodeExecution {
  status: NodeExecutionStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface JobHistoryItem {
  node: NodeName;
  status: "started" | "completed" | "failed";
  at: string;
  attempt?: number;
  message?: string;
}

export interface JobState {
  id: string;
  executionId: string;
  workflowName: string;
  workflowVersion: number;
  status: JobStatus;
  currentNode: NodeName | null;
  input: ProductInput;
  product?: ProductData;
  analysis?: AnalysisData;
  content?: ContentData;
  production?: ProductionData;
  post?: PostData;
  postAnalysis?: PostAnalysisData;
  nodeData: Partial<Record<NodeName, NodePayload>>;
  nodeExecutions: Partial<Record<NodeName, NodeExecution>>;
  history: JobHistoryItem[];
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface NodeContext {
  job: JobState;
  input: NodePayload;
  attempt: number;
}

export interface FlowNode {
  readonly name: NodeName;
  readonly inputPorts: readonly NodePort[];
  readonly outputPorts: readonly NodePort[];
  execute(context: NodeContext): Promise<NodePayload>;
}

export interface NodeConnection {
  from: NodeName;
  output: string;
  to: NodeName;
  input: string;
}

export interface WorkflowDefinition {
  name: string;
  version: number;
  nodes: readonly NodeName[];
  connections: readonly NodeConnection[];
}
