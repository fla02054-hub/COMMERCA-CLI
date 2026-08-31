import fs from "node:fs";
import path from "node:path";
import type { Product } from "../product/types.js";
import { runAutonomousAgent, type AutonomousAgentResult } from "../runtime/autonomous-agent.js";
import { saveJob } from "../runtime/job-store.js";

export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; report: string; jobId?: string; decisions?: string[]; cycles?: number };

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadLocalEnv();

function extractJson(text: string) { return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? text.trim(); }

async function understandProduct(goal: string, context: Record<string, unknown> | undefined): Promise<Product | undefined> {
  const supplied = context?.product;
  if (supplied && typeof supplied === "object") {
    const p = supplied as Partial<Product>;
    if (typeof p.name === "string" && p.name && typeof p.price === "number" && typeof p.originalPrice === "number" && typeof p.url === "string" && p.url) return p as Product;
  }
  const apiKey = typeof context?.geminiApiKey === "string" ? context.geminiApiKey : process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the AI Agent.");
  const model = typeof context?.geminiModel === "string" ? context.geminiModel : process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: [
      "Extract product input from the user's job request for an ecommerce workflow.",
      "Return ONLY JSON with: name, price, originalPrice, url, image.",
      "Use only values explicitly present in the request. Do not invent missing values.",
      `User request: ${goal}`
    ].join("\n") }] }] })
  });
  if (!response.ok) throw new Error(`Gemini intake failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json() as any;
  const text = payload.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no product intake result.");
  const value = JSON.parse(extractJson(text)) as Partial<Product>;
  if (typeof value.name !== "string" || typeof value.price !== "number" || typeof value.originalPrice !== "number" || typeof value.url !== "string") return undefined;
  return { id: `manual-${crypto.randomUUID()}`, name: value.name, price: value.price, originalPrice: value.originalPrice, discount: value.originalPrice > 0 ? Math.round(((value.originalPrice - value.price) / value.originalPrice) * 100) : 0, url: value.url, image: typeof value.image === "string" ? value.image : undefined, source: "discord", discoveredAt: new Date().toISOString() };
}

export class AIAgent {
  readonly name = "AI Agent";
  readonly role = "Autonomous AI agent with Gemini as its model, operating COMMERCA as a tool";

  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim()) return { status: "needs_input", goal: task.goal, report: "ส่งรายละเอียดงานมาได้เลย" };
    try {
      const product = await understandProduct(task.goal, task.context);
      if (!product) return { status: "needs_input", goal: task.goal, report: "ต้องการข้อมูลสินค้าอย่างน้อย ชื่อสินค้า ราคา ราคาปกติ และลิงก์สินค้า" };
      const jobId = `JOB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const outputDir = typeof task.context?.outputDir === "string" ? task.context.outputDir : path.join(process.env.COMMERCA_OUTPUT_ROOT ?? "./output", jobId);
      const outputMp4 = typeof task.context?.outputMp4 === "string" ? task.context.outputMp4 : path.join(outputDir, "final.mp4");
      const result: AutonomousAgentResult = await runAutonomousAgent(task.goal, product, { apiKey: typeof task.context?.geminiApiKey === "string" ? task.context.geminiApiKey : undefined, model: typeof task.context?.geminiModel === "string" ? task.context.geminiModel : undefined, outputDir, outputMp4, maxCycles: 20, maxAutonomousRevisions: 5, onProgress: typeof task.context?.onProgress === "function" ? task.context.onProgress as (message: string) => void : undefined });
      await saveJob(jobId, result.workflow);
      const status = result.workflow.state.status === "completed" ? "completed" : "failed";
      return { status, goal: task.goal, jobId, report: JSON.stringify({ jobId, status: result.workflow.state.status, stage: result.workflow.state.currentStage, decisions: result.decisions }, null, 2), decisions: result.decisions, cycles: result.cycles };
    } catch (error) {
      return { status: "failed", goal: task.goal, report: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const agent = new AIAgent();
