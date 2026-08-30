import fs from "node:fs";
import path from "node:path";
import { AgentToolRuntime } from "./tool-runtime.js";
import { browserTool } from "./browser-tool.js";
import { OpenRouterBrain } from "./openrouter-brain.js";
import { chooseRakatookyangAction } from "./autonomous-progress-guard.js";

function loadLocalEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key] === undefined) process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}
loadLocalEnv();

export type AgentAction = { type: "observe" | "plan" | "use_tool" | "analyze" | "decide" | "report"; thought: string; tool?: string; input?: unknown; result?: unknown };
export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; plan: AgentAction[]; report: string; model?: string };
export interface AgentBrain { decide(input: { goal: string; observation?: unknown; history: AgentAction[] }): Promise<{ action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string }>; }

class RuleBasedBrain implements AgentBrain {
  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    const observation = input.observation as any;
    const controls = Array.isArray(observation?.controls) ? observation.controls : [];
    const lastBrowserAction = [...input.history].reverse().find(x => x.type === "use_tool" && x.tool === "browser")?.input as any;
    const raka = chooseRakatookyangAction({ goal: input.goal, controls, lastBrowserAction });
    if (raka) return { action: "use_tool" as const, tool: "browser", input: raka, reason: `RakaTookYang browser flow selected ${raka.action}.` };
    if (lastBrowserAction?.action === "press" || lastBrowserAction?.action === "click") return { action: "use_tool" as const, tool: "browser", input: { action: "observe" }, reason: "Inspect the RakaTookYang result before finishing." };
    return { action: "finish" as const, reason: "Browser flow completed with available evidence." };
  }
}

export class CommercaAgent {
  readonly name = "COMMERCA Agent";
  readonly role = "Autonomous general-purpose AI agent";
  readonly tools = new AgentToolRuntime();
  private readonly brain: AgentBrain;
  constructor(brain?: AgentBrain) {
    this.brain = brain ?? (process.env.OPENROUTER_API_KEY ? new OpenRouterBrain() : new RuleBasedBrain());
    this.tools.register(browserTool);
  }

  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim()) return { status: "needs_input", goal: task.goal, plan: [], report: "A goal is required." };
    const history: AgentAction[] = [{ type: "observe", thought: `Understand the goal: ${task.goal}` }, { type: "plan", thought: "Create a plan dynamically from the goal and observations." }];
    let observation: unknown;
    let lastError = "";
    let successfulToolUse = false;
    try {
      for (let i = 0; i < 12; i++) {
        const decision = await this.brain.decide({ goal: task.goal, observation, history });
        history.push({ type: "decide", thought: decision.reason, result: decision });
        if (decision.action === "finish") {
          if (!successfulToolUse) return { status: "failed", goal: task.goal, plan: history, report: lastError || "Agent finished without accomplishing the goal.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
          history.push({ type: "report", thought: "Summarize completed actions and evidence.", result: observation });
          return { status: "completed", goal: task.goal, plan: history, report: "Autonomous run completed with successful tool execution and evidence.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
        }
        if (!decision.tool) throw new Error("Agent selected a tool without a tool name.");
        try {
          const result = await this.tools.execute(decision.tool, decision.input);
          successfulToolUse = true;
          lastError = "";
          observation = result;
          history.push({ type: "use_tool", thought: decision.reason, tool: decision.tool, input: decision.input, result });
          history.push({ type: "analyze", thought: "Tool succeeded. Feed the result back before choosing the next action.", result });
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          observation = { error: lastError, failedTool: decision.tool, failedInput: decision.input };
          history.push({ type: "analyze", thought: `Tool failed. Change strategy using this error: ${lastError}`, result: observation });
        }
      }
      return { status: "failed", goal: task.goal, plan: history, report: lastError || "Agent reached its decision limit without proving the goal was accomplished.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
    } catch (error) {
      return { status: "failed", goal: task.goal, plan: history, report: error instanceof Error ? error.message : String(error), model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
    }
  }
}
export const agent = new CommercaAgent();
