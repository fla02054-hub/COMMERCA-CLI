import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private model?: string;
  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (!this.model) this.model = process.env.OPENROUTER_MODEL || (await selectFreeModel(this.apiKey)).id;
    const response = await fetch(OPENROUTER_URL, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI", "X-Title": "COMMERCA Autonomous Agent" }, body: JSON.stringify({ model: this.model, temperature: 0.1, messages: [
      { role: "system", content: "You are an autonomous browser agent. The user gives a goal, not a sequence of clicks. Inspect the latest browser observation and choose the NEXT concrete browser action. Available action schema: {action:'open'|'observe'|'click'|'type'|'press'|'scroll'|'find'|'extract'|'close', url?, selector?, text?, key?, amount?}. For click/type/press, you MUST provide a selector. Prefer selectors visible in the observation such as input, button, placeholder, aria-label, role, or stable CSS. After open, usually observe before acting. If the page is a product page, extract useful product information rather than merely stopping. Continue until the goal is evidenced or no safe progress is possible. Return ONLY JSON: {\"action\":\"use_tool\"|\"finish\",\"tool\":\"browser\"|null,\"input\":object|null,\"reason\":string}." },
      { role: "user", content: JSON.stringify({ goal: input.goal, latestObservation: input.observation, recentHistory: input.history.slice(-10) }) }
    ] }) });
    if (!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`OpenRouter model ${this.model} returned no decision.`);
    const clean = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    return JSON.parse(clean) as { action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string };
  }
  getModel() { return this.model; }
}
