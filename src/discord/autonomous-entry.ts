import fs from "node:fs";
import path from "node:path";
import { runAutonomousAgent } from "../runtime/index.js";
import { saveJob } from "../runtime/job-store.js";
import type { Product } from "../product/types.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "qwen/qwen3.6-27b";

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

function cleanJson(text: string): string {
  let value = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) value = fenced[1].trim();
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) value = value.slice(start, end + 1);
  return value;
}

async function askGroq(text: string, images: Array<{ url: string; contentType?: string }>): Promise<string> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new Error("GROQ_API_KEY is required for Discord Aiden.");
  const content: any[] = [{ type: "text", text }];
  for (const image of images.slice(0, 4)) {
    try {
      const response = await fetch(image.url);
      if (!response.ok) continue;
      const mime = response.headers.get("content-type")?.split(";")[0] || image.contentType || "image/jpeg";
      if (!mime.startsWith("image/")) continue;
      const data = Buffer.from(await response.arrayBuffer()).toString("base64");
      content.push({ type: "image_url", image_url: { url: `data:${mime};base64,${data}` } });
    } catch {
      // Continue with the other supplied images.
    }
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_VISION_MODEL?.trim() || DEFAULT_MODEL,
        messages: [{ role: "user", content }],
        temperature: 0,
        max_tokens: 1000,
      }),
    });
    if (response.ok) {
      const payload = await response.json() as any;
      const output = payload.choices?.[0]?.message?.content;
      if (typeof output !== "string" || !output.trim()) throw new Error("Groq returned no product analysis.");
      return output;
    }
    const body = await response.text();
    if (response.status !== 429 || attempt === 3) throw new Error(`Groq product analysis failed (${response.status}): ${body.slice(0, 500)}`);
    let waitMs = 3000 * (attempt + 1);
    try {
      const parsed = JSON.parse(body) as any;
      if (typeof parsed?.error?.message === "string") {
        const match = parsed.error.message.match(/try again in ([0-9.]+)s/i);
        if (match) waitMs = Math.max(waitMs, Math.ceil(Number(match[1]) * 1000));
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, waitMs + 250));
  }
  throw new Error("Groq product analysis failed after retries.");
}

function productFromAnalysis(goal: string, raw: string, images: Array<{ url: string }>): Product {
  let parsed: any;
  try { parsed = JSON.parse(cleanJson(raw)); }
  catch { throw new Error(`AI product analysis returned invalid JSON: ${cleanJson(raw).slice(0, 300)}`); }
  if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) throw new Error("AI product analysis did not identify the product name.");
  const shopee = goal.match(/https?:\/\/(?:s\.shopee\.co\.th|shopee\.co\.th|shopee\.com)\/[^\s]+/i)?.[0];
  const price = typeof parsed.price === "number" ? parsed.price : undefined;
  const originalPrice = typeof parsed.originalPrice === "number" ? parsed.originalPrice : undefined;
  const image = images[0]?.url || (typeof parsed.image === "string" ? parsed.image : undefined);
  return {
    id: `discord-${crypto.randomUUID()}`,
    name: parsed.name.trim(),
    price,
    originalPrice,
    discount: price !== undefined && originalPrice !== undefined && originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : undefined,
    url: shopee || (typeof parsed.url === "string" ? parsed.url : undefined),
    image,
    images: images.map(x => x.url),
    source: "discord",
    discoveredAt: new Date().toISOString(),
  };
}

export async function runDiscordAutonomous(goal: string, images: Array<{ url: string; contentType?: string }>, options: { onProgress?: (message: string) => void; outputDir?: string; outputMp4?: string } = {}) {
  options.onProgress?.("[AGENT] รับข้อมูลจาก Discord แล้ว; วิเคราะห์สินค้าเอง...");
  const raw = await askGroq([
    "คุณคือ Aiden autonomous product analyst ของ COMMERCA-CLI.",
    "ผู้ใช้ส่งข้อมูลสินค้าให้คุณแล้ว ห้ามถามผู้ใช้ให้ส่งข้อมูลซ้ำ.",
    "อ่านรูปที่แนบและข้อความเพื่อระบุสินค้าจริง.",
    "ห้ามเปิด Shopee URL และห้ามแต่งข้อมูลที่ไม่มีหลักฐานในรูป/ข้อความ.",
    "คืน JSON เท่านั้น: {name,price,originalPrice,url,image}.",
    `ข้อความจากผู้ใช้: ${goal}`,
  ].join("\n"), images);
  const product = productFromAnalysis(goal, raw, images);
  const jobId = `JOB-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const outputDir = options.outputDir || path.join(process.env.COMMERCA_OUTPUT_ROOT || "./output", jobId);
  const outputMp4 = options.outputMp4 || path.join(outputDir, "final.mp4");
  options.onProgress?.(`[AGENT] product identified: ${product.name}`);
  options.onProgress?.(`[AGENT] creating ${jobId} and starting autonomous workflow...`);
  const result = await runAutonomousAgent(goal, product, {
    outputDir,
    outputMp4,
    maxCycles: 20,
    maxAutonomousRevisions: 5,
    onProgress: options.onProgress,
  });
  await saveJob(jobId, result.workflow);
  options.onProgress?.(`[AGENT] job ${jobId} finished: ${result.workflow.state.status}/${result.workflow.state.currentStage}`);
  return { jobId, result, product };
}
