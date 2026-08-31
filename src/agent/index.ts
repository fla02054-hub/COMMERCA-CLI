import fs from "node:fs";
import path from "node:path";
import type { Product } from "../product/types.js";
import { runAutonomousAgent, resumeAutonomousAgent, type AutonomousAgentResult } from "../runtime/autonomous-agent.js";
import { latestJob, listJobs, saveJob, type SavedJob } from "../runtime/job-store.js";

export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; report: string; jobId?: string; decisions?: string[]; cycles?: number };
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };
type Intent = { mode: "chat" | "work" | "job"; action: "chat" | "start" | "report" | "resume"; reason: string };

function loadLocalEnv() { const file = path.join(process.cwd(), ".env"); if (!fs.existsSync(file)) return; for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) { const line = raw.trim(); if (!line || line.startsWith("#")) continue; const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/); if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); } }
loadLocalEnv();
function extractJson(text: string) { return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? text.trim(); }
function historyText(context?: Record<string, unknown>) { const history = Array.isArray(context?.conversation) ? context.conversation : []; return history.slice(-16).map((m: any) => `${m.role === "assistant" ? "Aiden" : "คุณ"}: ${String(m.content ?? "")}`).join("\n"); }
async function gemini(parts: GeminiPart[], context?: Record<string, unknown>, temperature = 0.35): Promise<string> { const apiKey = typeof context?.geminiApiKey === "string" ? context.geminiApiKey : process.env.GEMINI_API_KEY; if (!apiKey) throw new Error("GEMINI_API_KEY is required for the AI Agent."); const model = typeof context?.geminiModel === "string" ? context.geminiModel : process.env.GEMINI_MODEL || DEFAULT_MODEL; const response = await fetch(`${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, maxOutputTokens: 1400 } }) }); if (!response.ok) throw new Error(`Gemini request failed (${response.status}): ${(await response.text()).slice(0, 500)}`); const payload = await response.json() as any; const text = payload.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("").trim(); if (!text) throw new Error("Gemini returned no response."); return text; }
async function imageParts(context?: Record<string, unknown>): Promise<GeminiPart[]> { const images = Array.isArray(context?.images) ? context.images : []; const result: GeminiPart[] = []; for (const image of images.slice(0, 4) as any[]) { if (!image?.url) continue; const response = await fetch(String(image.url)); if (!response.ok) continue; const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg"; if (!mime.startsWith("image/")) continue; result.push({ inline_data: { mime_type: mime, data: Buffer.from(await response.arrayBuffer()).toString("base64") } }); } return result; }

async function classifyIntent(task: AgentTask): Promise<Intent> { const value = JSON.parse(extractJson(await gemini([{ text: ["คุณคือ Aiden ผู้ช่วยส่วนตัวของเจ้าของ COMMERCA.","เข้าใจเจตนาจากความหมายของข้อความและบริบท ไม่ใช้การจับคำตายตัว.","mode=chat สำหรับการสนทนา; mode=work เมื่อผู้ใช้ต้องการเริ่มงานใหม่; mode=job เมื่อกำลังจัดการ Job ที่มีอยู่แล้ว.","action=chat สำหรับคุย, start สำหรับเริ่มงานใหม่, report สำหรับดู/รายงาน Job, resume สำหรับทำ Job เดิมต่อหรือแก้งานที่ล้มเหลว.","ถ้าผู้ใช้บอกให้ทำต่อจากงานเดิม/งานล้มเหลว/งานค้าง ให้ action=resume.","คืน JSON เท่านั้น: {mode:'chat'|'work'|'job',action:'chat'|'start'|'report'|'resume',reason:string}.",`บริบท:\n${historyText(task.context)}`,`ข้อความล่าสุด: ${task.goal}`].join("\n")}], task.context, 0))) as Partial<Intent>; const modes:Intent["mode"][]=["chat","work","job"]; const actions:Intent["action"][]=["chat","start","report","resume"]; return {mode:modes.includes(value.mode as Intent["mode"])?value.mode as Intent["mode"]:"chat",action:actions.includes(value.action as Intent["action"])?value.action as Intent["action"]:"chat",reason:String(value.reason||"")}; }
function productFromJob(job: SavedJob): Product | undefined { const artifacts = job.workflow?.artifacts ?? []; for (const artifact of [...artifacts].reverse() as any[]) { if (artifact?.type !== "product-input") continue; const data = artifact.data; const raw = data?.product && typeof data.product === "object" ? data.product : data; if (raw && typeof raw.name === "string" && raw.name.trim()) return raw as Product; } return undefined; }
function summarizeJob(job: SavedJob) { const state = job.workflow.state as any; return {jobId:job.jobId,status:state?.status,currentStage:state?.currentStage,goal:job.workflow.goal}; }
async function chooseResumeJob(goal:string,jobs:SavedJob[],context?:Record<string,unknown>):Promise<SavedJob|undefined>{ if(!jobs.length)return undefined; const summaries=jobs.map(summarizeJob); const value=JSON.parse(extractJson(await gemini([{text:["เลือก Job จริงจากรายการนี้เพื่อทำตามคำขอของผู้ใช้.","หากคำขอหมายถึงทำต่อจากงานที่ล้มเหลว ให้เลือก Job ที่ status=failed ที่เหมาะที่สุด.","หากหมายถึงงานล่าสุด ให้พิจารณาความใหม่และสถานะจริง.","ห้ามสร้าง Job ID และห้ามเลือก Job ที่ไม่มีในรายการ.","คืน JSON เท่านั้น: {jobId:string|null}.",`คำขอ: ${goal}`,`Jobs จริง: ${JSON.stringify(summaries)}`].join("\n")}],context,0))) as {jobId?:string|null}; return jobs.find(j=>j.jobId===value.jobId); }

export class AIAgent {
  readonly name="Aiden";
  readonly role="Conversational autonomous AI agent with Gemini as its model, operating COMMERCA as a tool";
  async chat(task:AgentTask):Promise<string>{return gemini([{text:["คุณคือ Aiden ผู้ช่วยส่วนตัวของเจ้าของ COMMERCA.","คุยภาษาไทยอย่างเป็นธรรมชาติ เหมือนผู้ช่วยที่ทำงานร่วมกับเจ้าของจริง.","อย่าอ้างว่าค้นหรือทำสิ่งใดแล้วถ้ายังไม่ได้ทำจริง.",`บริบท:\n${historyText(task.context)}`,`ข้อความล่าสุด: ${task.goal}`].join("\n")}],task.context,0.5);}
  async run(task:AgentTask):Promise<AgentResult>{
    if(!task.goal.trim() && !(Array.isArray(task.context?.images)&&task.context.images.length))return{status:"needs_input",goal:task.goal,report:"ได้ครับ บอกผมได้เลยว่าต้องการให้ทำอะไร"};
    try{
      const intent=await classifyIntent(task);
      if(intent.mode==="chat")return{status:"completed",goal:task.goal,report:await this.chat(task)};
      const jobs=await listJobs();
      if(intent.mode==="job"){
        if(intent.action==="report")return{status:"completed",goal:task.goal,report:JSON.stringify(jobs.map(summarizeJob),null,2)};
        const selected=await chooseResumeJob(task.goal,jobs,task.context);
        if(!selected)return{status:"needs_input",goal:task.goal,report:"ตรวจ Job Store แล้ว แต่ไม่พบงานเดิมที่ตรงกับคำขอ"};
        if(intent.action!=="resume")return{status:"completed",goal:task.goal,jobId:selected.jobId,report:JSON.stringify(summarizeJob(selected),null,2)};
        const product=productFromJob(selected);
        if(!product)return{status:"failed",goal:task.goal,jobId:selected.jobId,report:`พบ ${selected.jobId} จริง แต่ไม่พบข้อมูล product-input ที่มีหลักฐานใน workflow`};
        const progress=task.context?.onProgress;if(typeof progress==="function")progress(`[JOB] selected ${selected.jobId} status=${selected.workflow.state.status} stage=${selected.workflow.state.currentStage}`);
        const outputDir=typeof task.context?.outputDir==="string"?task.context.outputDir:path.join(process.env.COMMERCA_OUTPUT_ROOT??"./output",selected.jobId);
        const outputMp4=typeof task.context?.outputMp4==="string"?task.context.outputMp4:path.join(outputDir,"final.mp4");
        const result:AutonomousAgentResult=await resumeAutonomousAgent(selected.workflow,product,{apiKey:typeof task.context?.geminiApiKey==="string"?task.context.geminiApiKey:undefined,model:typeof task.context?.geminiModel==="string"?task.context.geminiModel:undefined,outputDir,outputMp4,maxCycles:20,maxAutonomousRevisions:5,onProgress:typeof progress==="function"?progress as (message:string)=>void:undefined});
        await saveJob(selected.jobId,result.workflow);const status=result.workflow.state.status==="completed"?"completed":result.workflow.state.status==="failed"?"failed":"needs_input";return{status,goal:task.goal,jobId:selected.jobId,report:JSON.stringify({jobId:selected.jobId,status:result.workflow.state.status,stage:result.workflow.state.currentStage,decisions:result.decisions},null,2),decisions:result.decisions,cycles:result.cycles};
      }
      if(intent.action!=="start")return{status:"completed",goal:task.goal,report:JSON.stringify(jobs.map(summarizeJob),null,2)};
      const product=await understandProduct(task.goal,task.context);
      if(!product)return{status:"needs_input",goal:task.goal,report:"ยังไม่มีข้อมูลสินค้าใหม่ที่มีหลักฐานเพียงพอสำหรับเริ่มงาน"};
      const jobId=`JOB-${new Date().toISOString().replace(/\D/g,"").slice(0,14)}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
      const outputDir=typeof task.context?.outputDir==="string"?task.context.outputDir:path.join(process.env.COMMERCA_OUTPUT_ROOT??"./output",jobId);
      const outputMp4=typeof task.context?.outputMp4==="string"?task.context.outputMp4:path.join(outputDir,"final.mp4");
      const result:AutonomousAgentResult=await runAutonomousAgent(task.goal,product,{apiKey:typeof task.context?.geminiApiKey==="string"?task.context.geminiApiKey:undefined,model:typeof task.context?.geminiModel==="string"?task.context.geminiModel:undefined,outputDir,outputMp4,maxCycles:20,maxAutonomousRevisions:5,onProgress:typeof task.context?.onProgress==="function"?task.context.onProgress as (message:string)=>void:undefined});
      await saveJob(jobId,result.workflow);const status=result.workflow.state.status==="completed"?"completed":"failed";return{status,goal:task.goal,jobId,report:JSON.stringify({jobId,status,stage:result.workflow.state.currentStage,decisions:result.decisions},null,2),decisions:result.decisions,cycles:result.cycles};
    }catch(error){return{status:"failed",goal:task.goal,report:error instanceof Error?error.message:String(error)}}
  }
}

async function understandProduct(goal:string,context?:Record<string,unknown>):Promise<Product|undefined>{const supplied=context?.product;if(supplied&&typeof supplied==="object"){const p=supplied as Partial<Product>;if(typeof p.name==="string"&&p.name)return p as Product;}const parts:GeminiPart[]=[{text:["คุณคือ Aiden ผู้ช่วย AI ของเจ้าของ COMMERCA.","ดึงเฉพาะข้อมูลสินค้าที่มีหลักฐานจริงจากข้อความ บริบท และรูปภาพ.","ห้ามแต่งชื่อสินค้า ราคา หรือลิงก์.","คืน JSON เท่านั้น: {name,price,originalPrice,url,image}.",`บริบท:\n${historyText(context)}`,`คำขอล่าสุด: ${goal}`].join("\n")},...(await imageParts(context))];const value=JSON.parse(extractJson(await gemini(parts,context,0))) as Partial<Product>;if(typeof value.name!=="string"||!value.name)return undefined;return{id:`discord-${crypto.randomUUID()}`,name:value.name,price:typeof value.price==="number"?value.price:undefined,originalPrice:typeof value.originalPrice==="number"?value.originalPrice:undefined,discount:typeof value.price==="number"&&typeof value.originalPrice==="number"&&value.originalPrice>0?Math.round(((value.originalPrice-value.price)/value.originalPrice)*100):undefined,url:typeof value.url==="string"?value.url:undefined,image:typeof value.image==="string"?value.image:undefined,source:"discord",discoveredAt:new Date().toISOString()};}
export const agent=new AIAgent();