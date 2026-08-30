import type { Product } from "../product/types.js";
import { createRuntimeWorkflow, executeWorkflow, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { WorkflowStage, WorkflowArtifact } from "./workflow-schema.js";

export interface AutonomousAgentOptions {
  outputDir?: string;
  outputMp4?: string;
  maxCycles?: number;
  maxAutonomousRevisions?: number;
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export interface AgentDecision {
  action: "continue" | "revise" | "stop" | "publish" | "optimize";
  nextStage?: WorkflowStage;
  reason: string;
  confidence: number;
}

export interface AutonomousAgentResult {
  workflow: RuntimeWorkflow;
  cycles: number;
  decisions: string[];
}

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() ?? text.trim();
}

function allowedNextStages(stage: WorkflowStage): WorkflowStage[] {
  const map: Record<WorkflowStage, WorkflowStage[]> = {
    goal: ["product-input"],
    "product-input": ["product-analysis"],
    "product-analysis": ["product-scoring"],
    "product-scoring": ["product-selection"],
    "product-selection": ["content-strategy"],
    "content-strategy": ["creative-strategy"],
    "creative-strategy": ["production"],
    production: ["qc"],
    qc: ["publishing", "creative-strategy", "production", "content-strategy"],
    publishing: ["performance"],
    performance: ["decision-learning"],
    "decision-learning": ["content-strategy"],
  };
  return map[stage];
}

function latestArtifacts(artifacts: WorkflowArtifact[]): WorkflowArtifact[] {
  return artifacts.slice(-12).map((item) => ({ stage: item.stage, type: item.type, data: item.data, createdAt: item.createdAt }));
}

async function askAgent(stage: WorkflowStage, product: Product, artifacts: WorkflowArtifact[], options: AutonomousAgentOptions): Promise<AgentDecision> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  const allowed = allowedNextStages(stage);
  const fallback: AgentDecision = stage === "decision-learning"
    ? { action: "stop", reason: "No AI decision provider configured; stop after the current learning cycle.", confidence: 0.5 }
    : { action: allowed.length ? "continue" : "stop", nextStage: allowed[0], reason: "No AI decision provider configured; continue using the safe workflow transition.", confidence: 0.5 };
  if (!apiKey) return fallback;

  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = [
    "You are the autonomous decision-making agent for an ecommerce affiliate production workflow.",
    "You own the next decision. Do not merely repeat the workflow order.",
    "Analyze the product and latest artifacts, then decide the best next action.",
    "Never invent facts. If evidence is insufficient, choose the safest valid continuation.",
    "For QC failures, choose the stage that should be revised based on the issues.",
    "For performance/decision-learning, decide whether to optimize, publish, or stop based on evidence.",
    "At decision-learning, choose stop when there is no evidence that another iteration is better.",
    "Return ONLY JSON: {action, nextStage, reason, confidence}.",
    `Current stage: ${stage}`,
    `Allowed next stages: ${JSON.stringify(allowed)}`,
    `Product: ${JSON.stringify(product)}`,
    `Latest artifacts: ${JSON.stringify(latestArtifacts(artifacts))}`,
  ].join("\n");

  try {
    const response = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!response.ok) return { ...fallback, reason: `AI decision request failed (${response.status}); safe decision selected.` };
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return fallback;
    const value = JSON.parse(extractJson(text)) as Partial<AgentDecision>;
    const action = ["continue", "revise", "stop", "publish", "optimize"].includes(String(value.action)) ? value.action as AgentDecision["action"] : fallback.action;
    const nextStage = typeof value.nextStage === "string" && allowed.includes(value.nextStage as WorkflowStage) ? value.nextStage as WorkflowStage : fallback.nextStage;
    const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.min(1, Math.max(0, value.confidence)) : fallback.confidence;
    return { action, nextStage, reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : fallback.reason, confidence };
  } catch {
    return { ...fallback, reason: "AI decision could not be parsed; safe decision selected." };
  }
}

async function advance(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions): Promise<RuntimeWorkflow> {
  const executeOptions = {
    outputDir: options.outputDir,
    outputMp4: options.outputMp4,
    pauseAfterQc: false,
    autonomous: true,
    maxAutonomousRevisions: options.maxAutonomousRevisions ?? 3,
    decideNextStage: async (stage: WorkflowStage, current: RuntimeWorkflow) => {
      const decision = await askAgent(stage, product, current.artifacts, options);
      current.artifacts.push({ stage, type: "agent-decision", data: decision, createdAt: new Date().toISOString() });
      return decision;
    },
  } as const;
  if (workflow.state.status === "awaiting-approval") {
    workflow.state.status = "running";
    workflow.state.approval = { ...(workflow.state.approval ?? { requestedAt: new Date().toISOString() }), approvedAt: new Date().toISOString() };
  }
  const registry = createStageRegistry({ product, outputDir: options.outputDir, outputMp4: options.outputMp4 });
  return executeWorkflow(workflow, registry, executeOptions);
}

export async function runAutonomousAgent(goal: string, product: Product, options: AutonomousAgentOptions = {}): Promise<AutonomousAgentResult> {
  return resumeAutonomousAgent(createRuntimeWorkflow(goal), product, options);
}

export async function resumeAutonomousAgent(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions = {}): Promise<AutonomousAgentResult> {
  const maxCycles = Math.max(1, options.maxCycles ?? 3);
  const decisions: string[] = [];
  let current = workflow;
  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    decisions.push(`cycle ${cycle}: ${current.state.status}/${current.state.currentStage}`);
    if (current.state.status === "completed" || current.state.status === "failed") return { workflow: current, cycles: cycle, decisions };
    current = await advance(current, product, options);
    const agentDecisions = current.artifacts.filter((item) => item.type === "agent-decision").slice(-5).map((item) => JSON.stringify(item.data));
    decisions.push(`cycle ${cycle}: result=${current.state.status}/${current.state.currentStage}`);
    decisions.push(...agentDecisions);
    if (current.state.status === "completed" || current.state.status === "failed") return { workflow: current, cycles: cycle, decisions };
  }
  return { workflow: current, cycles: maxCycles, decisions };
}
