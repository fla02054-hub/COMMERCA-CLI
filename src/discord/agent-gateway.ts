import { agent } from "../agent/index.js";

const token = process.env.DISCORD_AGENT_TOKEN?.trim();
const channelAllowlist = new Set((process.env.DISCORD_AGENT_CHANNELS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const api = "https://discord.com/api/v10";
const reconnectDelayMs = 3000;
const messageQueue: Promise<void> = Promise.resolve();
let queue = messageQueue;

if (!token) throw new Error("DISCORD_AGENT_TOKEN is required.");

async function discord(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}

async function send(channelId: string, content: string) {
  await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: content.slice(0, 1900) }) });
}

async function runTask(channelId: string, message: any) {
  const text = message.content.trim();
  if (text === "/agent" || text === "/agent help") {
    await send(channelId, "Aiden พร้อมรับงานแล้ว\nส่งงานมาได้เลย");
    return;
  }
  await send(channelId, "รับงานแล้ว\nกำลังให้ Aiden วิเคราะห์และลงมือทำ...");
  const result = await agent.run({
    goal: text,
    context: {
      source: "discord",
      channelId,
      userId: message.author.id,
      onProgress: (progress: string) => { void send(channelId, `Aiden: ${progress}`); }
    }
  });
  const status = result.status === "completed" ? "เสร็จแล้ว ✅" : result.status === "needs_input" ? "ต้องการข้อมูลเพิ่ม" : "งานยังไม่สำเร็จ ❌";
  const details = result.jobId ? `Job: ${result.jobId}\n` : "";
  await send(channelId, `${status}\n${details}\n${result.report}`);
}

async function handleMessage(message: any) {
  if (!message?.id || message.author?.bot || !message.content?.trim()) return;
  if (channelAllowlist.size && !channelAllowlist.has(message.channel_id)) return;
  const channelId = String(message.channel_id);
  queue = queue.then(() => runTask(channelId, message)).catch(async (error) => {
    await send(channelId, `Aiden พบข้อผิดพลาด: ${error instanceof Error ? error.message : String(error)}`);
  });
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
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: sequence }));
      }, interval);
      ws.send(JSON.stringify({ op: 2, d: { token, intents: 33281, properties: { os: "linux", browser: "aiden", device: "aiden" } } }));
    } else if (packet.op === 0 && packet.t === "MESSAGE_CREATE") {
      await handleMessage(packet.d);
    } else if (packet.op === 1) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: sequence }));
    } else if (packet.op === 7 || packet.op === 9) {
      ws.close();
    }
  };
  ws.onclose = () => {
    clearInterval(heartbeat);
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = undefined; void connect(); }, reconnectDelayMs);
  };
  ws.onerror = () => ws.close();
}

console.log("Aiden Discord gateway starting...");
await connect();
