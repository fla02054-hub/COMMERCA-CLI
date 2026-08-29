import type { AgentAction, AgentBrain } from "./index.js";
import { OPENROUTER_URL, selectFreeModel } from "./openrouter-model.js";

type BrowserControl = { tag:string; role:string; name:string; placeholder:string; selector:string };

export class OpenRouterBrain implements AgentBrain {
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private model?: string;

  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    if (!this.apiKey) throw new Error("OPENROUTER_API_KEY is required for the autonomous AI brain.");
    if (!this.model) this.model = process.env.OPENROUTER_MODEL || (await selectFreeModel(this.apiKey)).id;

    const observation = input.observation as any;
    const controls: BrowserControl[] = Array.isArray(observation?.controls) ? observation.controls : [];
    const recent = input.history.slice(-12);
    const lastBrowserAction = [...input.history].reverse().find((x) => x.type === "use_tool" && x.tool === "browser")?.input as any;
    const hasObservation = Boolean(observation && !observation.error);
    const searchGoal = input.goal.match(/(?:ค้นหา|search)\s+(.+?)(?:\s+(?:บน|on|ใน|in)\s+|$)/i)?.[1]?.trim();
    const searchTarget = controls.find((c) => /textarea|input/i.test(c.tag) && /ค้นหา|search|query/i.test(`${c.name} ${c.placeholder} ${c.role}`));

    // Once Chrome has been observed, observation is evidence for the next action.
    // Do not allow the model to waste a turn observing the same page again.
    const actionEnum = hasObservation
      ? ["click", "type", "press", "scroll", "find", "extract"]
      : ["open", "observe", "click", "type", "press", "scroll", "find", "extract"];

    const tools = [{
      type: "function",
      function: {
        name: "browser",
        description: "Execute exactly one browser action in the real Chrome session. Never describe an action; execute it.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            action: { type: "string", enum: actionEnum },
            url: { type: "string" },
            selector: { type: "string" },
            text: { type: "string" },
            key: { type: "string" },
            amount: { type: "number" }
          },
          required: ["action"]
        }
      }
    }];

    const actionableControls = controls
      .filter((c) => /input|textarea|textbox|combobox|button|link|search/i.test(`${c.tag} ${c.role} ${c.name} ${c.placeholder}`))
      .slice(0, 60);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/fla02054-hub/COMMERCA-CLI",
        "X-Title": "COMMERCA Autonomous Agent"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        max_tokens: 400,
        tools,
        tool_choice: "required",
        messages: [
          {
            role: "system",
            content: "You are an autonomous browser agent. You must take actions, not merely explain them. After open, inspect once. After an observation exists, NEVER choose observe again: choose a useful interaction such as type, click, press, scroll, find, or extract. Use only selectors supplied by the browser observation. For a Google search goal, if the page is Google and a search textbox exists, choose type with that textbox selector and the exact requested query. If the immediately preceding browser action was type into a search box, choose press with the same selector and key Enter. Continue acting until the runtime can verify the goal."
          },
          {
            role: "user",
            content: JSON.stringify({
              goal: input.goal,
              page: observation ? { url: observation.url, title: observation.title, text: observation.text?.slice(0, 12000) } : null,
              actionableControls,
              extractedSearchQuery: searchGoal || null,
              suggestedSearchTarget: searchTarget || null,
              lastBrowserAction: lastBrowserAction || null,
              recentHistory: recent
            })
          }
        ]
      })
    });

    if (!response.ok) throw new Error(`OpenRouter request failed using ${this.model}: ${response.status} ${await response.text()}`);
    const payload = await response.json() as any;
    const call = payload.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) throw new Error(`OpenRouter model ${this.model} did not return a browser tool call.`);

    const action = JSON.parse(call.function.arguments);

    // Hard safety against the exact failure seen in testing: observe -> observe.
    if (hasObservation && action.action === "observe") {
      if (searchTarget && searchGoal) {
        return { action: "use_tool" as const, tool: "browser", input: { action: "type", selector: searchTarget.selector, text: searchGoal }, reason: "Prevented an observe loop; executing the detected search input." };
      }
      return { action: "use_tool" as const, tool: "browser", input: { action: "extract" }, reason: "Prevented an observe loop; extracting evidence from the current page." };
    }

    return {
      action: "use_tool" as const,
      tool: "browser",
      input: action,
      reason: `OpenRouter ${this.model} selected executable browser action: ${action.action}`
    };
  }

  getModel() { return this.model; }
}
