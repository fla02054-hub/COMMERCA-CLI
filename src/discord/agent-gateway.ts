import fs from "node:fs";
import path from "node:path";
import { runDiscordAutonomous } from "./autonomous-entry.js";
import { history, remember } from "./conversation-memory.js";

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

const token = process.env.DISCORD_AGENT_TOKEN?.trim();
const channelAllowlist = new Set((process.env.DISCORD_AGENT_CHANNELS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const api = "https://discord.com/api/v10";
const reconnectDelayMs = 3000;
const discordMaxRetries = 4;
let queue: Promise<void> = Promise.resolve();
let sendQueue: Promise<void> = Promise.resolve();

if (!token) throw new Error("DISCORD_AGENT_TOKEN is required.");

async function discord(pathname: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt <= discordMaxRetries; attempt += 1) {
    const response = await fetch(`${api}${pathname}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    if (response.ok) return response.status === 204 ? null : response.json();
    const body = await response.text();
    if (response.status !== 429 || attempt === discordMaxRetries) throw new Error(`Discord API ${response.status}: ${body.slice(0, 500)}`);
    let retryAfterMs = 1000;
    try { const parsed = JSON.parse(body) as any; if (typeof parsed.retry_after === "number") retryAfterMs = Math.max(250, Math.ceil(parsed.retry_after * 1000)); } catch {}
    await new Promise(resolve => setTimeout(resolve, retryAfterMs + 100));
  }
  throw new Error("Discord request failed after retries.");
}

function send(channelId: string, content: string): Promise<void> {
  const task = sendQueue.then(async () => {
    try { await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: content.slice(0, 1900) }) }); }
    catch (error) { console.error(`[Aiden] Discord send failed: ${error instanceof Error ? error.message : String(error)}`); }
  });
  sendQueue = task.catch(() => undefined);
  return task;
}

function extractImageUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>]+/gi) ?? []).map(url => url.replace(/[),.!?]+$/, "")).filter(url => /\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(url) || /img\.susercontent\.com/i.test(url)).slice(0, 4);
}
function extractAllUrls(text: string): string[] { return (text.match(/https?:\/\/[^\s<>]+/gi) ?? []).map(url => url.replace(/[),.!?]+$/, "")).slice(0, 12); }

async function runMessage(channelId: string, message: any) {
  const text = String(message.content ?? "").trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter((a: any) => typeof a?.url === "string").map((a: any) => ({ url: a.url, name: a.name, contentType: a.content_type })) : [];
  const imageUrls = extractImageUrls(text);
  const allUrls = extractAllUrls(text);
  if (!text && !attachments.length) return;
  const prior = history(channelId);
  const userContent = text || `[แนบไฟล์/รูป ${attachments.length} รายการ]`;
  remember(channelId, { role: "user", content: userContent, at: new Date().toISOString() });
  if (text === "/agent" || text === "/agent help") {
    const answer = "ได้ครับ ผม Aiden พร้อมรับข้อมูลและจัดการงานให้เอง";
    await send(channelId, answer); remember(channelId, { role: "assistant", content: answer, at: new Date().toISOString() }); return;
  }
  const images = [...attachments, ...imageUrls.map(url => ({ url, contentType: "image/url" }))].slice(0, 4);
  const onProgress = (progress: string) => { void send(channelId, `Aiden: ${progress}`); };
  console.log(`[Aiden] Discord message received | input=autonomous | text=${JSON.stringify(text.slice(0, 160))}`);
  await send(channelId, "รับเรื่องครับ ผมจะวิเคราะห์ข้อมูลและจัดการให้เอง");
  try {
    console.log("[Aiden] autonomous entry starting");
    const run = await runDiscordAutonomous(text, images, { onProgress });
    const status = run.result.workflow.state.status;
    const answer = status === "completed"
      ? `ดำเนินการเสร็จแล้วครับ ✅\nJob: ${run.jobId}\n${JSON.stringify({ stage: run.result.workflow.state.currentStage, decisions: run.result.decisions }, null, 2)}`
      : `งานยังไม่สำเร็จ ❌\n${JSON.stringify({ jobId: run.jobId, status, stage: run.result.workflow.state.currentStage, decisions: run.result.decisions }, null, 2)}`;
    console.log(`[Aiden] autonomous finished | status=${status} | jobId=${run.jobId}`);
    remember(channelId, { role: "assistant", content: answer, at: new Date().toISOString() });
    await send(channelId, answer);
  } catch (error) {
    const answer = `Aiden พบข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[Aiden] autonomous failed: ${answer}`);
    remember(channelId, { role: "assistant", content: answer, at: new Date().toISOString() });
    await send(channelId, answer);
  }
}

async function handleMessage(message: any) {
  if (!message?.id || message.author?.bot) return;
  if (channelAllowlist.size && !channelAllowlist.has(String(message.channel_id))) return;
  const channelId = String(message.channel_id);
  queue = queue.then(() => runMessage(channelId, message)).catch(async error => { await send(channelId, `Aiden พบข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}`); });
  await queue;
}

let sequence: number | null = null;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
async function connect() {
  const gateway = await discord("/gateway/bot") as { url: string };
  const ws = new WebSocket(`${gateway.url}?v=10&encoding=json`);
  ws.onmessage = async event => {
    const packet = JSON.parse(String(event.data));
    if (packet.s != null) sequence = Number(packet.s);
    if (packet.op === 10) {
      const interval = Number(packet.d.heartbeat_interval);
      clearInterval(heartbeat);
      heartbeat = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: sequence })); }, interval);
      ws.send(JSON.stringify({ op: 2, d: { token, intents: 33281, properties: { os: "windows", browser: "aiden", device: "aiden" } } }));
    } else if (packet.op === 0 && packet.t === "MESSAGE_CREATE") await handleMessage(packet.d);
    else if (packet.op === 1 && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: sequence }));
    else if (packet.op === 7 || packet.op === 9) ws.close();
  };
  ws.onclose = () => { clearInterval(heartbeat); if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, reconnectDelayMs); };
  ws.onerror = () => ws.close();
}
console.log("Aiden Discord gateway starting...");
await connect();
