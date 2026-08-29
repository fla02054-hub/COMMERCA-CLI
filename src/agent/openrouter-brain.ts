import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModels, type ModelInfo } from "./openrouter-model.js";
import { chooseSearchAction } from "./autonomous-progress-guard.js";

type BrowserControl = { tag: string; role: string; name: string; placeholder: string; selector: string };

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private models: ModelInfo[] = [];
  private modelIndex = 0;

  private async ensureModels() {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (this.models.length) return;
    const configured = (process.env.OPENROUTER_MODELS ?? process.env.OPENROUTER_MODEL ?? "")
      .split(",").map((x) => x.trim()).filter(Boolean);
    this.models = configured.length ? configured.map((id) => ({ id })) : await selectFreeModels(this.apiKey);
    if (!this.models.length) throw new Error("No OpenRouter models are configured or available.");
  }

  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    await this.ensureModels();
    const observation = input.observation as any;
    const controls: BrowserControl[] = Array.isArray(observation?.controls) ? observation.controls : [];
    const hasObservation = Boolean(observation && !observation.error);
    const lastBrowserAction = [...input.history].reverse().find((x) => x.type === "use_tool" && x.tool === "browser")?.input as any;
    const forced = hasObservation ? chooseSearchAction({ goal: input.goal, controls, lastBrowserAction }) : undefined;
    if (forced) return { action: "use_tool" as const, tool: "browser", input: forced, reason: `Autonomous progress guard selected ${forced.action}.` };

    const actionEnum = hasObservation ? ["click", "type", "press", "scroll", "find", "extract"] : ["open", "observe", "click", "type", "press", "scroll", "find", "extract"];
    const tools = [{ type: "function", function: { name: "browser", description: "Execute one browser action in real Chrome.", parameters: {
      type: "object", additionalProperties: false,
      properties: { action: { type: "string", enum: actionEnum }, url: { type: "string" }, selector: { type: "string" }, text: { type: "string" }, key: { type: "string" }, amount: { type: "number" } },
      required: ["action"]
    } } }];

    let lastFailure = "";
    for (let attempt = 0; attempt < this.models.length; attempt++) {
      const model = this.models[this.modelIndex % this.models.length];
      try {
        const response = await fetch(OPENROUTER_URL, { method: "POST", headers: {
          Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI", "X-Title": "COMMERCA Autonomous Agent"
        }, body: JSON.stringify({ model: model.id, temperature: 0, max_tokens: 500, tools, tool_choice: "required", messages: [
          { role: "system", content: "You are an autonomous browser agent. Return exactly one executable browser tool call. Never choose observe when an observation already exists. Use only selectors supplied by observation. Continue until the goal is verifiably achieved." },
          { role: "user", content: JSON.stringify({ goal: input.goal, page: hasObservation ? { url: observation.url, title: observation.title, text: observation.text?.slice(0, 12000) } : null, controls: controls.slice(0, 80), lastBrowserAction: lastBrowserAction || null, history: input.history.slice(-16) }) }
        ] }) });
        if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
        const payload = await response.json() as any;
        const call = payload.choices?.[0]?.message?.tool_calls?.[0];
        if (!call?.function?.arguments) throw new Error("model did not return a browser tool call");
        const action = JSON.parse(call.function.arguments);
        if (hasObservation && action.action === "observe") return { action: "use_tool" as const, tool: "browser", input: { action: "extract" }, reason: "Prevented an observation loop." };
        return { action: "use_tool" as const, tool: "browser", input: action, reason: `OpenRouter ${model.id} selected ${action.action}.` };
      } catch (error) {
        lastFailure = `${model.id}: ${error instanceof Error ? error.message : String(error)}`;
        this.modelIndex = (this.modelIndex + 1) % this.models.length;
      }
    }
    throw new Error(`All configured OpenRouter models failed. Last error: ${lastFailure}`);
  }

  getModel() { return this.models[this.modelIndex % this.models.length]?.id; }
  getModels() { return this.models.map((m) => m.id); }
}
