import fs from "node:fs";
import path from "node:path";
import type { Product } from "../product/types.js";
import { runAutonomousAgent, resumeAutonomousAgent, type AutonomousAgentResult } from "../runtime/autonomous-agent.js";
import { listJobs, saveJob, type SavedJob } from "../runtime/job-store.js";

export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; report: string; jobId?: string; decisions?: string[]; cycles?: number };
type AIPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type Intent = { mode: "chat" | "work" | "job"; reason: string };
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";
const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.6-27b";

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadLocalEnv();

function extractJson(text: string) { return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? text.trim(); }
function historyText(context?: Record<string, unknown>) { const h = Array.isArray(context?.conversation) ? context.conversation : []; return h.slice(-16).map((m: any) => `${m.role === "assistant" ? "Aiden" : "คุณ"}: ${String(m.content ?? "")}`).join("\n"); }

function groqMessages(parts: AIPart[]) {
  const content = parts.map(part => part.inline_data ? { type: "image_url", image_url: { url: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}` } } : { type: "text", text: part.text ?? "" });
  return [{ role: "user", content }];
}

async function ai(parts: AIPart[], context?: Record<string, unknown>, temperature = 0.35): Promise<string> {
  const apiKey = typeof context?.groqApiKey === "string" ? context.groqApiKey : process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is required for the AI Agent.");
  const hasImage = parts.some(part => !!part.inline_data);
  const model = hasImage ? (typeof context?.groqVisionModel === "string" ? context.groqVisionModel : process.env.GROQ_VISION_MODEL || DEFAULT_GROQ_VISION_MODEL) : (typeof context?.groqModel === "string" ? context.groqModel : process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL);
  const response = await fetch(GROQ_BASE, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: groqMessages(parts), temperature, max_tokens: 1400 }) });
  if (!response.ok) throw new Error(`Groq request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json() as any; const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned no response."); return text;
}

async function imageParts(context?: Record<string, unknown>): Promise<AIPart[]> {
  const images = Array.isArray(context?.images) ? context.images : []; const result: AIPart[] = [];
  for (const image of images.slice(0, 4) as any[]) {
    if (!image?.url) continue;
    const response = await fetch(String(image.url)); if (!response.ok) continue;
    const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    if (mime.startsWith("image/")) result.push({ inline_data: { mime_type: mime, data: Buffer.from(await response.arrayBuffer()).toString("base64") } });
  }
  return result;
}

function summarizeJob(job: SavedJob) { const s = job.workflow.state; return { jobId: job.jobId, status: s.status, currentStage: s.currentStage, goal: job.workflow.goal }; }
function productFromJob(job: SavedJob): Product | undefined {
  const input = [...job.workflow.artifacts].reverse().find((a: any) => a.type === "product-input")?.data as Partial<Product> | undefined;
  if (!input?.name || typeof input.price !== "number" || !input.url || !input.image) return undefined;
  return input as Product;
}

async function classifyIntent(task: AgentTask, jobs: SavedJob[]): Promise<Intent> {
  const hasImages = Array.isArray(task.context?.images) && task.context.images.length > 0;
  const hasProduct = !!task.context?.product && typeof task.context.product === "object";
  const hasShopeeLink = /https?:\/\/(?:s\.shopee\.co\.th|shopee\.co\.th|shopee\.com)\//i.test(task.goal);
  if (hasImages || hasProduct || hasShopeeLink) return { mode: "work", reason: "พบข้อมูลสินค้าใหม่จากรูป/ข้อมูลสินค้า/Shopee link จึงสร้าง Job ใหม่" };
  const value = JSON.parse(extractJson(await ai([{ text: [
    "คุณคือ Aiden ผู้ช่วยส่วนตัวของเจ้าของ COMMERCA.", "เข้าใจเจตนาจากภาษาธรรมชาติ.", "chat = สนทนา/ถามความคิดเห็น.", "work = เริ่มงานใหม่.", "job = จัดการงานที่มีอยู่แล้ว เช่น ตรวจสถานะ ทำงานเดิมต่อ หรือแก้งานที่ล้มเหลว.", "คืน JSON เท่านั้น: {mode:'chat'|'work'|'job',reason:string}.", `Job ที่มีอยู่จริง:\n${JSON.stringify(jobs.map(summarizeJob))}`, `บริบท:\n${historyText(task.context)}`, `ข้อความล่าสุด: ${task.goal}`
  ].join("\n") }], task.context, 0))) as Partial<Intent>;
  if (value.mode === "job") return { mode: "job", reason: String(value.reason || "ผู้ใช้กำลังจัดการงานเดิม") };
  if (value.mode === "work") return { mode: "work", reason: String(value.reason || "ผู้ใช้สั่งเริ่มงาน") };
  return { mode: "chat", reason: String(value.reason || "เป็นการสนทนา") };
}

async function chooseExistingJob(task: AgentTask, jobs: SavedJob[], intent: Intent): Promise<{ action: "inspect" | "resume"; jobId?: string }> {
  const failed = jobs.filter(j => j.workflow.state.status === "failed");
  const value = JSON.parse(extractJson(await ai([{ text: [
    "คุณคือ Aiden และกำลังจัดการ Job ที่มีอยู่จริง.", "เลือกจาก Job ID ที่ให้มาเท่านั้น ห้ามสร้าง Job ID ใหม่.", "inspect = ดู/รายงานงานโดยยังไม่ลงมือทำ.", "resume = ทำต่อ/แก้งานเดิม.", "ถ้าระบุงานล้มเหลวล่าสุด ให้เลือก failed Job ที่มี Job ID สูงสุด.", "ถ้าไม่ระบุงานและสั่งทำต่อ ให้เลือกงานที่เหมาะสม โดยไม่เลือก completed ถ้ามี failed job ที่ตรงกับคำขอ.", "คืน JSON เท่านั้น: {action:'inspect'|'resume',jobId:string|null}.", `Jobs ทั้งหมด:\n${JSON.stringify(jobs.map(summarizeJob))}`, `Failed jobs:\n${JSON.stringify(failed.map(summarizeJob))}`, `คำขอ: ${task.goal}`, `Intent: ${intent.reason}`
  ].join("\n") }], task.context, 0))) as { action?: string; jobId?: string | null };
  const action = value.action === "resume" ? "resume" : "inspect";
  const selected = value.jobId ? jobs.find(j => j.jobId === value.jobId) : undefined;
  if (action === "resume" && selected) return { action, jobId: selected.jobId };
  if (action === "resume" && failed.length) return { action, jobId: failed.sort((a,b) => b.jobId.localeCompare(a.jobId))[0].jobId };
  return { action: "inspect", jobId: selected?.jobId };
}

async function handleExistingJobs(task: AgentTask, intent: Intent): Promise<AgentResult> {
  const jobs = await listJobs();
  if (!jobs.length) return { status: "completed", goal: task.goal, report: "ตรวจ Job Store จริงแล้วครับ ตอนนี้ยังไม่มี Job ที่บันทึกอยู่ในระบบ" };
  const decision = await chooseExistingJob(task, jobs, intent);
  if (decision.action === "inspect") return { status: "completed", goal: task.goal, report: JSON.stringify(jobs.map(summarizeJob), null, 2), jobId: decision.jobId };
  const selected = jobs.find(j => j.jobId === decision.jobId);
  if (!selected) return { status: "needs_input", goal: task.goal, report: "ผมหา Job ที่ตรงกับคำขอจาก Job Store ไม่พบครับ" };
  const product = productFromJob(selected);
  if (!product) return { status: "needs_input", goal: task.goal, jobId: selected.jobId, report: `พบ ${selected.jobId} ที่ ${selected.workflow.state.currentStage} แต่ข้อมูล product-input ไม่ครบพอสำหรับ resume อย่างปลอดภัยครับ` };
  const outputDir = typeof task.context?.outputDir === "string" ? task.context.outputDir : path.join(process.env.COMMERCA_OUTPUT_ROOT ?? "./output", selected.jobId);
  const outputMp4 = typeof task.context?.outputMp4 === "string" ? task.context.outputMp4 : path.join(outputDir, "final.mp4");
  if (typeof task.context?.onProgress === "function") (task.context.onProgress as (message: string) => void)(`[JOB] resuming ${selected.jobId} from ${selected.workflow.state.currentStage}`);
  const result = await resumeAutonomousAgent(selected.workflow, product, { apiKey: typeof task.context?.groqApiKey === "string" ? task.context.groqApiKey : undefined, model: typeof task.context?.groqModel === "string" ? task.context.groqModel : undefined, outputDir, outputMp4, maxCycles: 20, maxAutonomousRevisions: 5, onProgress: task.context?.onProgress as ((message: string) => void) | undefined });
  await saveJob(selected.jobId, result.workflow); const status = result.workflow.state.status === "completed" ? "completed" : "failed";
  return { status, goal: task.goal, jobId: selected.jobId, report: JSON.stringify({ jobId: selected.jobId, status: result.workflow.state.status, stage: result.workflow.state.currentStage, decisions: result.decisions }, null, 2), decisions: result.decisions, cycles: result.cycles };
}

async function understandProduct(goal: string, context?: Record<string, unknown>): Promise<Product | undefined> {
  const supplied = context?.product;
  if (supplied && typeof supplied === "object") { const p = supplied as Partial<Product>; if (typeof p.name === "string" && p.name) return p as Product; }
  const parts: AIPart[] = [{ text: [
    "คุณคือ Aiden ผู้ช่วย AI ของเจ้าของ COMMERCA.", "อ่านข้อความ บริบท และรูปภาพ แล้วดึงเฉพาะข้อมูลสินค้าที่มีหลักฐานจริง.", "ห้ามแต่งชื่อสินค้า ราคา หรือลิงก์.", "ถ้า URL ในคำขอเป็น Shopee Affiliate ให้ใช้ URL นั้นเป็น product URL โดยไม่เปิดลิงก์.", "ถ้าเป็นลิงก์รูป ให้ใช้เป็น image URL ได้และสามารถดาวน์โหลดเพื่ออ่านภาพได้.", "คืน JSON เท่านั้น: {name,price,originalPrice,url,image}.", `บริบท:\n${historyText(context)}`, `คำขอ: ${goal}`
  ].join("\n") }, ...(await imageParts(context))];
  const value = JSON.parse(extractJson(await ai(parts, context, 0))) as Partial<Product>;
  if (typeof value.name !== "string" || !value.name) return undefined;
  const suppliedShopee = goal.match(/https?:\/\/(?:s\.shopee\.co\.th|shopee\.co\.th|shopee\.com)\/[^\s]+/i)?.[0];
  return { id: `discord-${crypto.randomUUID()}`, name: value.name, price: typeof value.price === "number" ? value.price : undefined, originalPrice: typeof value.originalPrice === "number" ? value.originalPrice : undefined, discount: typeof value.price === "number" && typeof value.originalPrice === "number" && value.originalPrice > 0 ? Math.round(((value.originalPrice - value.price) / value.originalPrice) * 100) : undefined, url: suppliedShopee || (typeof value.url === "string" ? value.url : undefined), image: typeof value.image === "string" ? value.image : undefined, source: "discord", discoveredAt: new Date().toISOString() };
}

export class AIAgent {
  readonly name = "Aiden";
  readonly role = "Conversational autonomous AI agent operating COMMERCA with Groq as the only AI provider";
  async chat(task: AgentTask): Promise<string> { return ai([{ text: ["คุณคือ Aiden ผู้ช่วยส่วนตัวของเจ้าของ COMMERCA.", "คุยภาษาไทยอย่างเป็นธรรมชาติ เหมือนผู้ช่วยที่ทำงานร่วมกับเจ้าของจริง.", "จำบริบทการสนทนา.", "อย่าอ้างว่าค้นหรือทำสิ่งใดแล้วถ้ายังไม่ได้ทำจริง.", `บริบท:\n${historyText(task.context)}`, `ข้อความล่าสุด: ${task.goal}`].join("\n") }], task.context, 0.5); }
  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim() && !(Array.isArray(task.context?.images) && task.context?.images.length)) return { status: "needs_input", goal: task.goal, report: "ได้ครับ บอกผมได้เลยว่าต้องการให้ทำอะไร" };
    try {
      const jobs = await listJobs(); const intent = await classifyIntent(task, jobs);
      if (intent.mode === "chat") return { status: "completed", goal: task.goal, report: await this.chat(task) };
      if (intent.mode === "job") return handleExistingJobs(task, intent);
      const product = await understandProduct(task.goal, task.context);
      if (!product) return { status: "needs_input", goal: task.goal, report: "ข้อมูลสินค้าไม่พอสำหรับเริ่ม workflow อย่างปลอดภัยครับ" };
      const jobId = `JOB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const outputDir = typeof task.context?.outputDir === "string" ? task.context.outputDir : path.join(process.env.COMMERCA_OUTPUT_ROOT ?? "./output", jobId);
      const outputMp4 = typeof task.context?.outputMp4 === "string" ? task.context.outputMp4 : path.join(outputDir, "final.mp4");
      const result: AutonomousAgentResult = await runAutonomousAgent(task.goal, product, { apiKey: typeof task.context?.groqApiKey === "string" ? task.context.groqApiKey : undefined, model: typeof task.context?.groqModel === "string" ? task.context.groqModel : undefined, outputDir, outputMp4, maxCycles: 20, maxAutonomousRevisions: 5, onProgress: task.context?.onProgress as ((message: string) => void) | undefined });
      await saveJob(jobId, result.workflow); const status = result.workflow.state.status === "completed" ? "completed" : "failed";
      return { status, goal: task.goal, jobId, report: JSON.stringify({ jobId, status: result.workflow.state.status, stage: result.workflow.state.currentStage, decisions: result.decisions }, null, 2), decisions: result.decisions, cycles: result.cycles };
    } catch (error) { return { status: "failed", goal: task.goal, report: error instanceof Error ? error.message : String(error) }; }
  }
}
export const agent = new AIAgent();
