import fs from "node:fs";
import path from "node:path";
import type { Product } from "../product/types.js";
import { createRuntimeWorkflow, executeWorkflow, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { WorkflowStage, WorkflowArtifact } from "./workflow-schema.js";

export interface AutonomousAgentOptions { outputDir?: string; outputMp4?: string; maxCycles?: number; maxAutonomousRevisions?: number; apiKey?: string; model?: string; fetchImpl?: typeof fetch; onProgress?: (message: string) => void; }
export interface AgentDecision { action: "continue" | "revise" | "stop" | "publish" | "optimize"; nextStage?: WorkflowStage; reason: string; confidence: number; }
export interface AutonomousAgentResult { workflow: RuntimeWorkflow; cycles: number; decisions: string[]; }
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}
loadLocalEnv();

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() ?? text.trim();
}

function allowedNextStages(stage: WorkflowStage): WorkflowStage[] {
  const map: Record<WorkflowStage, WorkflowStage[]> = {
    goal: ["product-input"], "product-input": ["product-analysis"], "product-analysis": ["product-scoring"],
    "product-scoring": ["product-selection"], "product-selection": ["content-strategy"],
    "content-strategy": ["creative-strategy"], "creative-strategy": ["production"], production: ["qc"],
    qc: ["publishing", "creative-strategy", "production", "content-strategy"], publishing: ["performance"],
    performance: ["decision-learning"], "decision-learning": ["content-strategy", "creative-strategy", "production", "publishing"]
  };
  return map[stage] ?? [];
}

function latestArtifacts(artifacts: WorkflowArtifact[]): WorkflowArtifact[] {
  return artifacts.slice(-12).map(item => ({ stage: item.stage, type: item.type, data: item.data, createdAt: item.createdAt }));
}

function normalizeDecision(value: Partial<AgentDecision>, fallback: AgentDecision, allowed: WorkflowStage[]): AgentDecision {
  const action = ["continue", "revise", "stop", "publish", "optimize"].includes(String(value.action)) ? value.action as AgentDecision["action"] : fallback.action;
  const nextStage = typeof value.nextStage === "string" && allowed.includes(value.nextStage as WorkflowStage) ? value.nextStage as WorkflowStage : fallback.nextStage;
  const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.min(1, Math.max(0, value.confidence)) : fallback.confidence;
  return { action, nextStage, reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : fallback.reason, confidence };
}

async function askGemini(stage: WorkflowStage, product: Product, artifacts: WorkflowArtifact[], options: AutonomousAgentOptions, fallback: AgentDecision, allowed: WorkflowStage[]): Promise<AgentDecision> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback;
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = [
    "You are the autonomous decision-maker for COMMERCA-CLI.",
    "The user only supplies the product. You own the rest of the workflow.",
    "Inspect the current stage and artifacts, decide what should happen next, and do not ask the user for approval.",
    "Choose only a stage from Allowed next stages. Never invent product facts.",
    "If QC failed, choose the specific upstream stage that should be revised.",
    "If the workflow has enough evidence to publish, choose publish with nextStage=publishing.",
    "If performance/learning shows a better iteration is needed, choose optimize and select the revision stage.",
    "If there is no useful next action, choose stop.",
    "Return ONLY JSON with action, nextStage, reason, confidence.",
    `Current stage: ${stage}`,
    `Allowed next stages: ${JSON.stringify(allowed)}`,
    `Product: ${JSON.stringify(product)}`,
    `Latest artifacts: ${JSON.stringify(latestArtifacts(artifacts))}`
  ].join("\n");
  try {
    const response = await fetchImpl(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, maxOutputTokens: 400 } })
    });
    if (!response.ok) return { ...fallback, reason: `Gemini decision request failed (${response.status}); safe decision selected.` };
    const payload = await response.json() as any;
    const text = payload.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("").trim();
    if (!text) return { ...fallback, reason: "Gemini returned no decision; safe decision selected." };
    return normalizeDecision(JSON.parse(extractJson(text)) as Partial<AgentDecision>, fallback, allowed);
  } catch (error) {
    return { ...fallback, reason: `Gemini decision could not be completed; safe decision selected. ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function askAgent(stage: WorkflowStage, product: Product, artifacts: WorkflowArtifact[], options: AutonomousAgentOptions): Promise<AgentDecision> {
  const allowed = allowedNextStages(stage);
  const fallback: AgentDecision = stage === "decision-learning"
    ? { action: "stop", reason: "No Gemini decision provider configured; stop after the current learning cycle.", confidence: .5 }
    : { action: allowed.length ? "continue" : "stop", nextStage: allowed[0], reason: "No Gemini decision provider configured; continue using the safe workflow transition.", confidence: .5 };
  return askGemini(stage, product, artifacts, options, fallback, allowed);
}

async function advance(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions): Promise<RuntimeWorkflow> {
  const log = options.onProgress ?? (() => {});
  const executeOptions = {
    outputDir: options.outputDir, outputMp4: options.outputMp4, pauseAfterQc: false, autonomous: true,
    maxAutonomousRevisions: options.maxAutonomousRevisions ?? 5,
    decideNextStage: async (stage: WorkflowStage, current: RuntimeWorkflow) => {
      log(`[AGENT] deciding after ${stage} with Gemini...`);
      const decision = await askAgent(stage, product, current.artifacts, options);
      current.artifacts.push({ stage, type: "agent-decision", data: decision, createdAt: new Date().toISOString() });
      log(`[AGENT] decision=${decision.action} next=${decision.nextStage ?? "none"} confidence=${decision.confidence.toFixed(2)}: ${decision.reason}`);
      return decision;
    }
  } as const;
  if (workflow.state.status === "awaiting-approval") {
    workflow.state.status = "running";
    workflow.state.approval = { ...(workflow.state.approval ?? { requestedAt: new Date().toISOString() }), approvedAt: new Date().toISOString() };
    log("[AGENT] approval gate taken over autonomously");
  }
  log(`[AGENT] running stage=${workflow.state.currentStage}`);
  const registry = createStageRegistry({ product, outputDir: options.outputDir, outputMp4: options.outputMp4 });
  const result = await executeWorkflow(workflow, registry, executeOptions);
  log(`[AGENT] cycle result=${result.state.status}/${result.state.currentStage}`);
  return result;
}

export async function runAutonomousAgent(goal: string, product: Product, options: AutonomousAgentOptions = {}): Promise<AutonomousAgentResult> { return resumeAutonomousAgent(createRuntimeWorkflow(goal), product, options); }

export async function resumeAutonomousAgent(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions = {}): Promise<AutonomousAgentResult> {
  const maxCycles = Math.max(1, options.maxCycles ?? 20);
  const decisions: string[] = [];
  let current = workflow;
  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    options.onProgress?.(`[AGENT] cycle ${cycle}/${maxCycles} status=${current.state.status} stage=${current.state.currentStage}`);
    decisions.push(`cycle ${cycle}: ${current.state.status}/${current.state.currentStage}`);
    if (current.state.status === "completed" || current.state.status === "failed") return { workflow: current, cycles: cycle, decisions };
    current = await advance(current, product, options);
    const agentDecisions = current.artifacts.filter(item => item.type === "agent-decision").slice(-5).map(item => JSON.stringify(item.data));
    decisions.push(`cycle ${cycle}: result=${current.state.status}/${current.state.currentStage}`);
    decisions.push(...agentDecisions);
    if (current.state.status === "completed" || current.state.status === "failed") return { workflow: current, cycles: cycle, decisions };
  }
  return { workflow: current, cycles: maxCycles, decisions };
}