import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private model?: string;

  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (!this.model) this.model = process.env.OPENROUTER_MODEL || (await selectFreeModel(this.apiKey)).id;
    const tools = [
      { type: "function", function: { name: "browser", description: "Control the real Google Chrome browser. Use this to open pages, inspect them, click elements, type text, press keys, scroll, find elements, extract text, or close the browser.", parameters: { type: "object", properties: { action: { type: "string", enum: ["open", "observe", "click", "type", "press", "scroll", "find", "extract", "close"] }, url: { type: "string" }, text: { type: "string" }, selector: { type: "string" }, key: { type: "string" }, direction: { type: "string", enum: ["up", "down"] } }, required: ["action"] } } }
    ];
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI", "X-Title": "COMMERCA Autonomous Agent" },
      body: JSON.stringify({ model: this.model, temperature: 0.2, tools, tool_choice: "auto", messages: [
        { role: "system", content: "You are the autonomous brain of a general-purpose AI employee. Inspect evidence, make plans, use browser tools, learn from failures, and change strategy when needed. Never repeat the same failed tool call more than once unless new evidence justifies it. Never claim success without evidence. Return ONLY JSON: {\"action\":\"use_tool\"|\"finish\",\"tool\":string|null,\"input\":object|null,\"reason\":string}." },
        { role: "user", content: JSON.stringify({ goal: input.goal, observation: input.observation, history: input.history.slice(-12) }) }
      ] })
    });
    if (!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }> };
    const message = payload.choices?.[0]?.message;
    const toolCall = message?.tool_calls?.[0];
    if (toolCall?.function?.name) return { action: "use_tool" as const, tool: toolCall.function.name, input: JSON.parse(toolCall.function.arguments || "{}"), reason: "AI model selected the browser tool based on the current goal and evidence." };
    const content = message?.content?.trim();
    if (!content) throw new Error(`OpenRouter model ${this.model} returned no decision.`);
    const decision = JSON.parse(content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")) as { action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string };
    return decision;
  }

  getModel() { return this.model; }
}
