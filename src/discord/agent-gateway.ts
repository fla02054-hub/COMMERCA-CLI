import { agent } from "../agent/index.js";
import { history, remember } from "./conversation-memory.js";

const token = process.env.DISCORD_AGENT_TOKEN?.trim();
const channelAllowlist = new Set((process.env.DISCORD_AGENT_CHANNELS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const api = "https://discord.com/api/v10";
const reconnectDelayMs = 3000;
let queue: Promise<void> = Promise.resolve();

if (!token) throw new Error("DISCORD_AGENT_TOKEN is required.");

async function discord(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}

async function send(channelId: string, content: string) {
  await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: content.slice(0, 1900) }) });
}

async function runMessage(channelId: string, message: any) {
  const text = String(message.content ?? "").trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter((a: any) => typeof a?.url === "string").map((a: any) => ({ url: a.url, name: a.name, contentType: a.content_type })) : [];
  if (!text && !attachments.length) return;
  const prior = history(channelId);
  remember(channelId, { role: "user", content: text || `[แนบไฟล์/รูป ${attachments.length} รายการ]`, at: new Date().toISOString() });
  if (text === "/agent" || text === "/agent help") { await send(channelId, "ได้ครับ ผม Aiden พร้อมคุยและรับงานแล้ว"); remember(channelId, { role: "assistant", content: "ได้ครับ ผม Aiden พร้อมคุยและรับงานแล้ว", at: new Date().toISOString() }); return; }
  const context = { source: "discord", channelId, userId: message.author.id, conversation: [...prior, { role: "user", content: text, at: new Date().toISOString() }], images: attachments, onProgress: (progress: string) => { void send(channelId, `Aiden: ${progress}`); } };
  const looksLikeWork = /ทำ|สร้าง|ทำงาน|เริ่ม|จัดการ|วิเคราะห์|คอนเทนต์|สินค้า|โพสต์|วิดีโอ|คลิป|ลงงาน|เอาไป/i.test(text) || attachments.length > 0;
  let answer: string;
  if (!looksLikeWork) answer = await agent.chat({ goal: text, context });
  else {
    await send(channelId, "รับเรื่องครับ เดี๋ยว Aiden จัดการให้");
    const result = await agent.run({ goal: text, context });
    answer = result.status === "completed" ? `เสร็จแล้วครับ ✅\nJob: ${result.jobId}\n${result.report}` : result.report;
  }
  remember(channelId, { role: "assistant", content: answer, at: new Date().toISOString() });
  await send(channelId, answer);
}

async function handleMessage(message: any) {
  if (!message?.id || message.author?.bot) return;
  if (channelAllowlist.size && !channelAllowlist.has(String(message.channel_id))) return;
  const channelId = String(message.channel_id);
  queue = queue.then(() => runMessage(channelId, message)).catch(async (error) => { await send(channelId, `Aiden พบข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}`); });
  await queue;
}

let sequence: number | null = null;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

async function connect() {
  const gateway = await discord("/gateway/bot") as { url: string };
  const ws = new WebSocket(`${gateway.url}?v=10&encoding=json`);
  ws.onmessage = async (event) => {
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
