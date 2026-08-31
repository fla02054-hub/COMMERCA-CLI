import fs from "node:fs";
import path from "node:path";

export type ConversationMessage = { role: "user" | "assistant"; content: string; at: string };

type Store = Record<string, ConversationMessage[]>;
const file = path.join(process.cwd(), ".commerca", "discord-conversations.json");

function read(): Store {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as Store; } catch { return {}; }
}
function write(store: Store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
}

export function history(channelId: string): ConversationMessage[] { return read()[channelId] ?? []; }
export function remember(channelId: string, message: ConversationMessage) {
  const store = read();
  store[channelId] = [...(store[channelId] ?? []), message].slice(-30);
  write(store);
}
