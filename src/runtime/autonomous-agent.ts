import fs from "node:fs";
import path from "node:path";
import type { Product } from "../product/types.js";
import { createRuntimeWorkflow, executeWorkflow, reopenForAutonomousCycle, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { WorkflowStage, WorkflowArtifact } from "./workflow-schema.js";

export interface AutonomousAgentOptions { outputDir?: string; outputMp4?: string; maxCycles?: number; maxAutonomousRevisions?: number; apiKey?: string; model?: string; fetchImpl?: typeof fetch; onProgress?: (message: string) => void; }
export interface AgentDecision { action: "continue" | "revise" | "stop" | "publish" | "optimize"; nextStage?: WorkflowStage; reason: string; confidence: number; }
export interface AutonomousAgentResult { workflow: RuntimeWorkflow; cycles: number; decisions: string[]; }
const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

function loadLocalEnv() { const file = path.join(process.cwd(), ".env"); if (!fs.existsSync(file)) return; for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (!match) continue; const [, key, value] = match; if (process.env[key] === undefined) process.env[key] = value.replace(/^['"]|['"]$/g, ""); } }
loadLocalEnv();
function extractJson(text: string): string { const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i); return fenced?.[1]?.trim() ?? text.trim(); }
function allowedNextStages(stage: WorkflowStage): WorkflowStage[] { const map: Record<WorkflowStage, WorkflowStage[]> = { "product-input":["product-analysis"], "product-analysis":["content-creative"], "content-creative":["production"], production:["qc"], qc:["final-package","content-creative","production"], "final-package":[] }; return map[stage] ?? []; }
function latestArtifacts(artifacts: WorkflowArtifact[]): WorkflowArtifact[] { return artifacts.slice(-12); }
function normalizeDecision(value: Partial<AgentDecision>, allowed: WorkflowStage[]): AgentDecision { const action = ["continue","revise","stop","publish","optimize"].includes(String(value.action)) ? value.action as AgentDecision["action"] : "stop"; const nextStage = typeof value.nextStage === "string" && allowed.includes(value.nextStage as WorkflowStage) ? value.nextStage as WorkflowStage : undefined; const confidence = typeof value.confidence === "number" && Number.isFinite(value.confidence) ? Math.min(1, Math.max(0, value.confidence)) : 0; return { action, nextStage, reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : "AI returned an incomplete decision.", confidence }; }

function isRetryable(status: number): boolean { return status === 408 || status === 429 || status >= 500; }

async function askGemini(stage: WorkflowStage, product: Product, artifacts: WorkflowArtifact[], options: AutonomousAgentOptions): Promise<AgentDecision> {
  const apiKey = options.apiKey?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("No AI provider is available for autonomous decisions.");
  const model = options.model?.trim() || process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL;
  const response = await (options.fetchImpl ?? fetch)(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({contents:[{parts:[{text:["You are the AI agent operating COMMERCA-CLI on behalf of the user.","The user gives you a job; you own and control the job from start to finish.","Choose the next action from the actual workflow state and evidence. Do not ask the user to operate COMMERCA manually.","If work fails or QC rejects an output, diagnose the evidence and choose the appropriate earlier stage to repair, then continue until the job is completed or you have a genuine unrecoverable failure.","Do not invent product facts or claim completion without evidence.","The workflow has exactly these stages: product-input, product-analysis, content-creative, production, qc, final-package.","Return ONLY JSON: {action,nextStage,reason,confidence}.",`Current stage: ${stage}`,`Allowed next stages: ${JSON.stringify(allowedNextStages(stage))}`,`Product: ${JSON.stringify(product)}`,`Latest artifacts: ${JSON.stringify(latestArtifacts(artifacts))}`].join("\n")}]}],generationConfig:{temperature:0,maxOutputTokens:400}})});
  if (!response.ok) throw new Error(`Gemini decision request failed (${response.status}): ${(await response.text()).slice(0,500)}`);
  const payload = await response.json() as any; const text = payload.candidates?.[0]?.content?.parts?.map((part:any)=>part.text ?? "").join("").trim(); if (!text) throw new Error("Gemini returned no autonomous decision."); return normalizeDecision(JSON.parse(extractJson(text)) as Partial<AgentDecision>, allowedNextStages(stage));
}

async function askGroq(stage: WorkflowStage, product: Product, artifacts: WorkflowArtifact[], options: AutonomousAgentOptions): Promise<AgentDecision> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");
  const model = process.env.GROQ_MODEL?.trim() || GROQ_MODEL;
  const prompt = ["You are the AI agent operating COMMERCA-CLI on behalf of the user.","You own the job from start to finish. Do not ask the user to operate COMMERCA manually.","Use only actual workflow state and evidence. Never invent product facts or claim completion without evidence.","If work fails or QC rejects output, choose the appropriate repair stage and continue.","Workflow stages: product-input, product-analysis, content-creative, production, qc, final-package.","Return ONLY valid JSON: {action,nextStage,reason,confidence}.",`Current stage: ${stage}`,`Allowed next stages: ${JSON.stringify(allowedNextStages(stage))}`,`Product: ${JSON.stringify(product)}`,`Latest artifacts: ${JSON.stringify(latestArtifacts(artifacts))}`].join("\n");
  const response = await (options.fetchImpl ?? fetch)(GROQ_BASE, { method:"POST", headers:{"content-type":"application/json",Authorization:`Bearer ${apiKey}`}, body:JSON.stringify({model,messages:[{role:"user",content:prompt}],temperature:0,max_tokens:400}) });
  if (!response.ok) throw new Error(`Groq decision request failed (${response.status}): ${(await response.text()).slice(0,500)}`);
  const payload = await response.json() as any; const text = payload.choices?.[0]?.message?.content?.trim(); if (!text) throw new Error("Groq returned no autonomous decision."); return normalizeDecision(JSON.parse(extractJson(text)) as Partial<AgentDecision>, allowedNextStages(stage));
}

async function askAI(stage: WorkflowStage, product: Product, artifacts: WorkflowArtifact[], options: AutonomousAgentOptions): Promise<AgentDecision> {
  if (process.env.GROQ_API_KEY?.trim()) {
    try { return await askGroq(stage, product, artifacts, options); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/\((\d{3})\)/); const status = match ? Number(match[1]) : 0;
      if (!isRetryable(status)) throw error;
      options.onProgress?.(`[AGENT] Groq unavailable (${status}); falling back to Gemini once.`);
    }
  }
  return askGemini(stage, product, artifacts, options);
}

async function advance(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions): Promise<RuntimeWorkflow> { const log=options.onProgress ?? (()=>{}); process.env.COMMERCA_PRODUCTION_PROVIDER="gemini"; const registry=createStageRegistry({product,outputDir:options.outputDir,outputMp4:options.outputMp4}); const result=await executeWorkflow(workflow,registry,{outputDir:options.outputDir,outputMp4:options.outputMp4,pauseAfterQc:false,autonomous:true,maxAutonomousRevisions:options.maxAutonomousRevisions ?? 5,decideNextStage:async(stage,current)=>{ log(`[AGENT] deciding after ${stage}...`); const decision=await askAI(stage,product,current.artifacts,options); current.artifacts.push({stage,type:"agent-decision",data:decision,createdAt:new Date().toISOString()}); log(`[AGENT] decision=${decision.action} next=${decision.nextStage ?? "none"} confidence=${decision.confidence.toFixed(2)}: ${decision.reason}`); return decision; }}); log(`[AGENT] cycle result=${result.state.status}/${result.state.currentStage}`); return result; }
export async function runAutonomousAgent(goal:string,product:Product,options:AutonomousAgentOptions={}):Promise<AutonomousAgentResult>{return resumeAutonomousAgent(createRuntimeWorkflow(goal),product,options);}
export async function resumeAutonomousAgent(workflow:RuntimeWorkflow,product:Product,options:AutonomousAgentOptions={}):Promise<AutonomousAgentResult>{const maxCycles=Math.max(1,options.maxCycles ?? 20);const decisions:string[]=[];let current=workflow;for(let cycle=1;cycle<=maxCycles;cycle++){if(current.state.status==="completed"||current.state.status==="failed")current=reopenForAutonomousCycle(current,current.state.currentStage);options.onProgress?.(`[AGENT] cycle ${cycle}/${maxCycles} status=${current.state.status} stage=${current.state.currentStage}`);decisions.push(`cycle ${cycle}: ${current.state.status}/${current.state.currentStage}`);try{current=await advance(current,product,options);}catch(error){const message=error instanceof Error?error.message:String(error);current.state.status="failed";const state=current.state.stages.find(s=>s.stage===current.state.currentStage);if(state)state.error=message;options.onProgress?.(`[AGENT] ERROR: ${message}`);decisions.push(`cycle ${cycle}: error=${message}`);return{workflow:current,cycles:cycle,decisions};}decisions.push(`cycle ${cycle}: result=${current.state.status}/${current.state.currentStage}`);if(current.state.status==="completed")return{workflow:current,cycles:cycle,decisions};}return{workflow:current,cycles:maxCycles,decisions};}
