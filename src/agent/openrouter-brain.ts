import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private model?: string;
  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (!this.model) this.model = process.env.OPENROUTER_MODEL || (await selectFreeModel(this.apiKey)).id;
    const tools = [{ type: "function", function: { name: "browser", description: "Control the real Chrome browser and inspect the current page.", parameters: { type: "object", additionalProperties: false, properties: { action: { type: "string", enum: ["open","observe","click","type","press","scroll","find","extract","close"] }, url: { type: "string" }, selector: { type: "string" }, text: { type: "string" }, key: { type: "string" }, amount: { type: "number" } }, required: ["action"] } } }];
    const response = await fetch(OPENROUTER_URL, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI", "X-Title": "COMMERCA Autonomous Agent" }, body: JSON.stringify({ model: this.model, temperature: 0.1, tools, tool_choice: "required", messages: [
      { role: "system", content: "You are an autonomous computer-use agent. Act, don't just describe. The user gives a goal. Inspect the latest browser observation and choose exactly ONE next browser action. After every browser result, decide the next action. If the goal is to inspect a URL, open it, observe it, then extract useful information. If interaction is needed, use click/type/press with selectors from controls. Do not finish immediately after opening. Only finish when the goal is evidenced as completed." },
      { role: "user", content: JSON.stringify({ goal: input.goal, latestObservation: input.observation ?? null, recentHistory: input.history.slice(-12) }) }
    ] }) });
    if (!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload = await response.json() as any;
    const call = payload.choices?.[0]?.message?.tool_calls?.[0];
    if (call?.function?.arguments) return { action: "use_tool" as const, tool: "browser", input: JSON.parse(call.function.arguments), reason: `AI selected browser action: ${call.function.name}` };
    throw new Error(`OpenRouter model ${this.model} did not return a browser tool call.`);
  }
  getModel() { return this.model; }
}
