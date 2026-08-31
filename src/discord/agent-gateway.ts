import { agent } from "../agent/index.js";

const token = process.env.DISCORD_AGENT_TOKEN?.trim();
const channelAllowlist = new Set((process.env.DISCORD_AGENT_CHANNELS ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const api = "https://discord.com/api/v10";

if (!token) throw new Error("DISCORD_AGENT_TOKEN is required.");

async function discord(path: string, init: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, { ...init, headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.status === 204 ? null : response.json();
}

async function send(channelId: string, content: string) {
  await discord(`/channels/${channelId}/messages`, { method: "POST", body: JSON.stringify({ content: content.slice(0, 1900) }) });
}

async function handleMessage(message: any) {
  if (!message?.id || message.author?.bot || !message.content?.trim()) return;
  if (channelAllowlist.size && !channelAllowlist.has(message.channel_id)) return;
  const text = message.content.trim();
  if (text === "/agent" || text === "/agent help") {
    await send(message.channel_id, "AI Agent พร้อมรับงานแล้ว\nส่งเป้าหมายงานมาได้เลย");
    return;
  }
  await send(message.channel_id, "รับงานแล้ว กำลังให้ AI Agent วิเคราะห์และลงมือทำ...");
  const result = await agent.run({ goal: text, context: { source: "discord", channelId: message.channel_id, userId: message.author.id } });
  const status = result.status === "completed" ? "เสร็จแล้ว ✅" : result.status === "needs_input" ? "ต้องการข้อมูลเพิ่ม" : "งานยังไม่สำเร็จ ❌";
  await send(message.channel_id, `${status}\n\n${result.report}`);
}

let sequence = "0";
let heartbeat: ReturnType<typeof setInterval> | undefined;

async function connect() {
  const gateway = await discord("/gateway/bot") as { url: string; };
  const ws = new WebSocket(`${gateway.url}?v=10&encoding=json`);
  ws.onmessage = async (event) => {
    const packet = JSON.parse(String(event.data));
    if (packet.s != null) sequence = String(packet.s);
    if (packet.op === 10) {
      const interval = packet.d.heartbeat_interval;
      heartbeat = setInterval(() => ws.send(JSON.stringify({ op: 1, d: sequence === "0" ? null : Number(sequence) })), interval);
      ws.send(JSON.stringify({ op: 2, d: { token, intents: 33281, properties: { os: "linux", browser: "commerca-agent", device: "commerca-agent" } } }));
    } else if (packet.op === 0 && packet.t === "MESSAGE_CREATE") {
      try { await handleMessage(packet.d); } catch (error) { await send(packet.d.channel_id, `Agent error: ${error instanceof Error ? error.message : String(error)}`); }
    } else if (packet.op === 9) {
      clearInterval(heartbeat); ws.close(); setTimeout(connect, 3000);
    }
  };
  ws.onclose = () => { clearInterval(heartbeat); setTimeout(connect, 3000); };
  ws.onerror = () => ws.close();
}

console.log("AI Agent Discord gateway starting...");
await connect();
