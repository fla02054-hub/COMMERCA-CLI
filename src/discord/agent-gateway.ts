import { agent } from "../agent/index.js";
import { history, remember } from "./conversation-memory.js";

const token = process.env.DISCORD_AGENT_TOKEN?.trim();
const channelAllowlist = new Set((process.env.DISCORD_AGENT_CHANNELS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const api = "https://discord.com/api/v10";
const reconnectDelayMs = 3000;
const discordMaxRetries = 4;
let queue: Promise<void> = Promise.resolve();
let sendQueue: Promise<void> = Promise.resolve();

if (!token) throw new Error("DISCORD_AGENT_TOKEN is required.");

async function discord(path: string, init: RequestInit = {}) {
  for (let attempt = 0; attempt <= discordMaxRetries; attempt += 1) {
    const response = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
    if (response.ok) return response.status === 204 ? null : response.json();

    const body = await response.text();
    if (response.status !== 429 || attempt === discordMaxRetries) {
      throw new Error(`Discord API ${response.status}: ${body.slice(0, 500)}`);
    }

    let retryAfterMs = 1000;
    try {
      const parsed = JSON.parse(body) as { retry_after?: number; global?: boolean };
      if (typeof parsed.retry_after === "number") retryAfterMs = Math.max(250, Math.ceil(parsed.retry_after * 1000));
      if (parsed.global) retryAfterMs = Math.max(retryAfterMs, 1000);
    } catch {
      // Keep the conservative fallback delay when Discord returns a non-JSON body.
    }
    retryAfterMs += 100;
    console.log(`[Aiden] Discord rate limited; retrying in ${retryAfterMs}ms (attempt ${attempt + 1}/${discordMaxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
  }
  throw new Error("Discord request failed after retries.");
}

function send(channelId: string, content: string): Promise<void> {
  const task = sendQueue.then(async () => {
    try {
      await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: content.slice(0, 1900) }) });
    } catch (error) {
      // Discord transport failures must not abort the agent or workflow. Log them
      // locally; the next queued message gets its own delivery attempt.
      console.error(`[Aiden] Discord send failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  sendQueue = task.catch(() => undefined);
  return task;
}

function extractImageUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s<>]+/gi) ?? [];
  return urls
    .map((url) => url.replace(/[),.!?]+$/, ""))
    .filter((url) => /\.(?:png|jpe?g|webp|gif)(?:\?.*)?$/i.test(url) || /img\.susercontent\.com/i.test(url))
    .slice(0, 4);
}

function extractAllUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s<>]+/gi) ?? [])
    .map((url) => url.replace(/[),.!?]+$/, ""))
    .slice(0, 12);
}

async function runMessage(channelId: string, message: any) {
  const text = String(message.content ?? "").trim();
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
        .filter((a: any) => typeof a?.url === "string")
        .map((a: any) => ({ url: a.url, name: a.name, contentType: a.content_type }))
    : [];
  const imageUrls = extractImageUrls(text);
  const allUrls = extractAllUrls(text);
  if (!text && !attachments.length) return;

  const prior = history(channelId);
  const userContent = text || `[แนบไฟล์/รูป ${attachments.length} รายการ]`;
  remember(channelId, { role: "user", content: userContent, at: new Date().toISOString() });

  if (text === "/agent" || text === "/agent help") {
    await send(channelId, "ได้ครับ ผม Aiden พร้อมรับข้อมูลและจัดการงานให้เอง");
    remember(channelId, { role: "assistant", content: "ได้ครับ ผม Aiden พร้อมรับข้อมูลและจัดการงานให้เอง", at: new Date().toISOString() });
    return;
  }

  const context = {
    source: "discord",
    channelId,
    userId: message.author.id,
    conversation: [...prior, { role: "user", content: userContent, at: new Date().toISOString() }],
    images: [...attachments, ...imageUrls.map((url) => ({ url, contentType: "image/url" }))].slice(0, 4),
    urls: allUrls,
    onProgress: (progress: string) => { void send(channelId, `Aiden: ${progress}`); }
  };

  console.log(`[Aiden] Discord message received | input=autonomous | text=${JSON.stringify(text.slice(0, 160))}`);
  await send(channelId, "รับเรื่องครับ ผมจะวิเคราะห์ข้อมูลและจัดการให้เอง");
  console.log("[Aiden] Starting agent.run()");
  const result = await agent.run({ goal: text, context });
  console.log(`[Aiden] agent.run() finished | status=${result.status} | jobId=${result.jobId ?? "none"}`);

  let answer: string;
  if (result.status === "completed" && result.jobId) {
    answer = `ดำเนินการเสร็จแล้วครับ ✅\nJob: ${result.jobId}\n${result.report}`;
  } else if (result.status === "completed") {
    answer = result.report;
  } else if (result.status === "needs_input") {
    answer = result.report;
  } else {
    answer = `งานยังไม่สำเร็จ ❌\n${result.report}`;
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