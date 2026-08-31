import fs from "node:fs";
import path from "node:path";
import type { Product } from "../product/types.js";
import { runAutonomousAgent, type AutonomousAgentResult } from "../runtime/autonomous-agent.js";
import { saveJob } from "../runtime/job-store.js";

export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; report: string; jobId?: string; decisions?: string[]; cycles?: number };

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

type Intent = { mode: "chat" | "work"; reason: string };

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
function historyText(context?: Record<string, unknown>) { const history = Array.isArray(context?.conversation) ? context.conversation : []; return history.slice(-16).map((m: any) => `${m.role === "assistant" ? "Aiden" : "คุณ"}: ${String(m.content ?? "")}`).join("\n"); }

async function gemini(parts: GeminiPart[], context?: Record<string, unknown>, temperature = 0.35): Promise<string> {
  const apiKey = typeof context?.geminiApiKey === "string" ? context.geminiApiKey : process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the AI Agent.");
  const model = typeof context?.geminiModel === "string" ? context.geminiModel : process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, maxOutputTokens: 1400 } }) });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as any;
  const text = payload.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no response.");
  return text;
}

async function imageParts(context?: Record<string, unknown>): Promise<GeminiPart[]> {
  const images = Array.isArray(context?.images) ? context.images : [];
  const result: GeminiPart[] = [];
  for (const image of images.slice(0, 4) as any[]) {
    if (!image?.url) continue;
    const response = await fetch(String(image.url));
    if (!response.ok) continue;
    const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (!mime.startsWith("image/")) continue;
    result.push({ inline_data: { mime_type: mime, data: Buffer.from(await response.arrayBuffer()).toString("base64") } });
  }
  return result;
}

async function classifyIntent(task: AgentTask): Promise<Intent> {
  const value = JSON.parse(extractJson(await gemini([{ text: [
    "คุณคือ Aiden ผู้ช่วยส่วนตัวของเจ้าของ COMMERCA.",
    "จำแนกเจตนาของข้อความล่าสุดจากบริบทสนทนา.",
    "chat = การพูดคุย/ถามความคิดเห็น/คุยต่อ โดยยังไม่ได้สั่งให้ระบบลงมือทำ.",
    "work = ผู้ใช้สั่งให้ค้นหา เลือก วิเคราะห์ สร้าง ทำงาน ผลิต ตรวจ หรือจัดการบางอย่าง.",
    "ถ้าผู้ใช้ใช้คำสั่งทำงานโดยนัย เช่น 'เอาตัวที่ดีที่สุดมาแล้วทำเลย' ให้เป็น work.",
    "คืน JSON เท่านั้น: {mode:'chat'|'work',reason:string}.",
    `บริบท:\n${historyText(task.context)}`,
    `ข้อความล่าสุด: ${task.goal}`
  ].join("\n") }], task.context, 0))) as Partial<Intent>;
  return value.mode === "work" ? { mode: "work", reason: String(value.reason || "ผู้ใช้สั่งให้ลงมือทำ") } : { mode: "chat", reason: String(value.reason || "เป็นการสนทนา") };
}

async function understandProduct(goal: string, context?: Record<string, unknown>): Promise<Product | undefined> {
  const supplied = context?.product;
  if (supplied && typeof supplied === "object") {
    const p = supplied as Partial<Product>;
    if (typeof p.name === "string" && p.name) return p as Product;
  }
  const parts: GeminiPart[] = [{ text: [
    "คุณคือ Aiden ผู้ช่วย AI ของเจ้าของ COMMERCA.",
    "อ่านข้อความ บริบท และรูปภาพ แล้วดึงเฉพาะข้อมูลสินค้าที่มีหลักฐานอยู่จริง.",
    "ห้ามแต่งชื่อสินค้า ราคา ราคาปกติ หรือลิงก์ขึ้นมาเอง.",
    "ถ้าไม่พบข้อมูลให้เป็น null.",
    "คืน JSON เท่านั้น: {name,price,originalPrice,url,image}.",
    `บริบทการสนทนา:\n${historyText(context)}`,
    `คำขอล่าสุด: ${goal}`
  ].join("\n") }, ...(await imageParts(context))];
  const value = JSON.parse(extractJson(await gemini(parts, context, 0))) as Partial<Product>;
  if (typeof value.name !== "string" || !value.name) return undefined;
  return { id: `discord-${crypto.randomUUID()}`, name: value.name, price: typeof value.price === "number" ? value.price : undefined, originalPrice: typeof value.originalPrice === "number" ? value.originalPrice : undefined, discount: typeof value.price === "number" && typeof value.originalPrice === "number" && value.originalPrice > 0 ? Math.round(((value.originalPrice - value.price) / value.originalPrice) * 100) : undefined, url: typeof value.url === "string" ? value.url : undefined, image: typeof value.image === "string" ? value.image : undefined, source: "discord", discoveredAt: new Date().toISOString() };
}

export class AIAgent {
  readonly name = "Aiden";
  readonly role = "Conversational autonomous AI agent with Gemini as its model, operating COMMERCA as a tool";

  async chat(task: AgentTask): Promise<string> {
    return gemini([{ text: [
      "คุณคือ Aiden ผู้ช่วยส่วนตัวของเจ้าของ COMMERCA.",
      "คุยภาษาไทยอย่างเป็นธรรมชาติ เหมือนผู้ช่วยที่ทำงานร่วมกับเจ้าของจริง.",
      "จำและใช้บริบทการสนทนา หลีกเลี่ยงการพูดซ้ำหรือถามสิ่งที่ผู้ใช้เพิ่งบอกไปแล้ว.",
      "อย่าตอบเป็นฟอร์ม อย่าอ้างว่าค้นหรือทำสิ่งใดแล้วถ้ายังไม่ได้ทำจริง.",
      "เมื่อผู้ใช้กำลังคุย ให้ตอบให้รู้เรื่องและต่อบทสนทนาอย่างเป็นธรรมชาติ.",
      "เมื่อผู้ใช้สั่งงาน ให้บอกสั้น ๆ ว่าจะจัดการ แล้วปล่อยให้ execution path ทำงาน.",
      `บริบทการสนทนา:\n${historyText(task.context)}`,
      `ข้อความล่าสุด: ${task.goal}`
    ].join("\n") }], task.context, 0.5);
  }

  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim() && !(Array.isArray(task.context?.images) && task.context?.images.length)) return { status: "needs_input", goal: task.goal, report: "ได้ครับ บอกผมได้เลยว่าต้องการให้ทำอะไร" };
    try {
      const intent = await classifyIntent(task);
      if (intent.mode === "chat") return { status: "completed", goal: task.goal, report: await this.chat(task) };

      const product = await understandProduct(task.goal, task.context);
      if (!product) {
        return { status: "needs_input", goal: task.goal, report: await gemini([{ text: [
          "คุณคือ Aiden. ผู้ใช้สั่งให้ลงมือทำ แต่ข้อมูลที่มีหลักฐานยังไม่พอเริ่ม workflow สินค้า.",
          "ห้ามสร้างสินค้า ราคา หรือลิงก์ปลอม และห้ามอ้างว่าดูเทรนด์หรือตลาดแล้วถ้าไม่มีเครื่องมือค้นจริง.",
          "คุยกับผู้ใช้แบบธรรมชาติ บอกว่าคุณต้องการข้อมูล/สิทธิ์เข้าถึงอะไรเพียงเท่าที่จำเป็น และอย่าถามเพื่อขออนุมัติขั้นตอนที่ไม่จำเป็น.",
          `บริบท:\n${historyText(task.context)}`,
          `คำขอ: ${task.goal}`
        ].join("\n") }], task.context, 0.45) };
      }

      const jobId = `JOB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const outputDir = typeof task.context?.outputDir === "string" ? task.context.outputDir : path.join(process.env.COMMERCA_OUTPUT_ROOT ?? "./output", jobId);
      const outputMp4 = typeof task.context?.outputMp4 === "string" ? task.context.outputMp4 : path.join(outputDir, "final.mp4");
      const result: AutonomousAgentResult = await runAutonomousAgent(task.goal, product, { apiKey: typeof task.context?.geminiApiKey === "string" ? task.context.geminiApiKey : undefined, model: typeof task.context?.geminiModel === "string" ? task.context.geminiModel : undefined, outputDir, outputMp4, maxCycles: 20, maxAutonomousRevisions: 5, onProgress: typeof task.context?.onProgress === "function" ? task.context.onProgress as (message: string) => void : undefined });
      await saveJob(jobId, result.workflow);
      const status = result.workflow.state.status === "completed" ? "completed" : "failed";
      return { status, goal: task.goal, jobId, report: JSON.stringify({ jobId, status: result.workflow.state.status, stage: result.workflow.state.currentStage, decisions: result.decisions }, null, 2), decisions: result.decisions, cycles: result.cycles };
    } catch (error) { return { status: "failed", goal: task.goal, report: error instanceof Error ? error.message : String(error) }; }
  }
}

export const agent = new AIAgent();
