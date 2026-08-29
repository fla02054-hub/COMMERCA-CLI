import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private model?: string;

  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (!this.model) this.model = process.env.OPENROUTER_MODEL || (await selectFreeModel(this.apiKey)).id;

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI", "X-Title": "COMMERCA Autonomous Agent" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You are an autonomous agent brain. Use evidence and history to decide the next useful action. Available tool: browser. If a tool fails, do not blindly repeat it; change strategy or finish with failure. Return ONLY JSON: {\"action\":\"use_tool\"|\"finish\",\"tool\":string|null,\"input\":object|null,\"reason\":string}. Never claim success without evidence." },
          { role: "user", content: JSON.stringify({ goal: input.goal, observation: input.observation, history: input.history.slice(-12) }) }
        ]
      })
    });
    if (!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`OpenRouter model ${this.model} returned no decision.`);
    const decision = JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as { action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string };
    if (decision.action !== "finish" && decision.action !== "use_tool") throw new Error(`Model ${this.model} returned an invalid action.`);
    return decision;
  }

  getModel() { return this.model; }
}
