import type { AgentAction, AgentBrain } from "./index.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private readonly model = process.env.OPENROUTER_MODEL || "openrouter/free";

  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");

    const tools = input.history
      .filter((x) => x.type === "use_tool")
      .map((x) => x.tool)
      .filter(Boolean);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI",
        "X-Title": "COMMERCA Autonomous Agent",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "You are an autonomous agent brain. Decide the next useful action from evidence. Available tool: browser. Return ONLY JSON: {\"action\":\"use_tool\"|\"finish\",\"tool\":string|null,\"input\":object|null,\"reason\":string}. Do not claim success without evidence." },
          { role: "user", content: JSON.stringify({ goal: input.goal, observation: input.observation, previousTools: tools }) },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter returned no decision.");
    const json = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    const decision = JSON.parse(json) as { action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string };
    if (decision.action !== "finish" && decision.action !== "use_tool") throw new Error("OpenRouter returned an invalid action.");
    return decision;
  }
}
