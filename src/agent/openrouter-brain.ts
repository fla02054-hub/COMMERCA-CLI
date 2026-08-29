import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private model?: string;
  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (!this.model) this.model = process.env.OPENROUTER_MODEL || (await selectFreeModel(this.apiKey)).id;
    const observation = input.observation as any;
    const controls = Array.isArray(observation?.controls) ? observation.controls : [];
    const recent = input.history.slice(-16);
    const consecutiveObserve = [...input.history].reverse().findIndex((x) => x.type !== "use_tool");
    const tools = [{ type: "function", function: { name: "browser", description: "Execute exactly one action in the real Chrome browser. When a page has a textbox/input relevant to the goal, type into it. When text is entered, press Enter or click the relevant submit/search button. Use selectors exactly as supplied by observation.", parameters: { type: "object", additionalProperties: false, properties: { action: { type: "string", enum: ["open","observe","click","type","press","scroll","find","extract","close"] }, url: { type: "string" }, selector: { type: "string" }, text: { type: "string" }, key: { type: "string" }, amount: { type: "number" } }, required: ["action"] } } }];
    const prompt = { goal: input.goal, latestObservation: observation ?? null, actionableControls: controls.filter((c: any) => /input|textarea|textbox|combobox|search/i.test(`${c.tag} ${c.role} ${c.name} ${c.placeholder}`)).slice(0,30), recentHistory: recent };
    const response = await fetch(OPENROUTER_URL, { method: "POST", headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI", "X-Title": "COMMERCA Autonomous Agent" }, body: JSON.stringify({ model: this.model, temperature: 0, max_tokens: 500, tools, tool_choice: { type: "function", function: { name: "browser" } }, messages: [
      { role: "system", content: "You are the action-taking brain of an autonomous browser agent. Never merely describe what should happen. Return one executable browser tool call. If the goal contains an instruction to search Google and the current page is Google, choose type on the visible search textbox using its supplied selector and put the requested search phrase in text. If text is already entered, choose press Enter on that textbox. If a browser action just succeeded, use the resulting observation to choose the next action. Do not repeatedly observe without progressing. Use only selectors supplied by the observation. Do not finish; the runtime decides completion after verification." },
      { role: "user", content: JSON.stringify(prompt) }
    ] }) });
    if (!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload = await response.json() as any;
    const call = payload.choices?.[0]?.message?.tool_calls?.[0];
    if (call?.function?.arguments) {
      const action = JSON.parse(call.function.arguments);
      if (action.action === "observe" && controls.length && consecutiveObserve >= 1) {
        const target = controls.find((c: any) => /textarea|textbox|combobox|input/i.test(`${c.tag} ${c.role}`) && /ค้นหา|search|query/i.test(`${c.name} ${c.placeholder}`));
        const query = input.goal.match(/(?:ค้นหา|search)\s+(.+?)(?:\s+บน|\s+on|$)/i)?.[1]?.trim();
        if (target && query) return { action: "use_tool" as const, tool: "browser", input: { action: "type", selector: target.selector, text: query }, reason: "AI stalled on observation; execute the relevant search input." };
      }
      return { action: "use_tool" as const, tool: "browser", input: action, reason: `AI selected browser action: ${action.action}` };
    }
    throw new Error(`OpenRouter model ${this.model} did not return a browser tool call.`);
  }
  getModel() { return this.model; }
}
