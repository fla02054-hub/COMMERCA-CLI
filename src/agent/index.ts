import fs from "node:fs";
import path from "node:path";
import { AgentToolRuntime } from "./tool-runtime.js";
import { browserTool } from "./browser-tool.js";
import { OpenRouterBrain } from "./openrouter-brain.js";

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

export class AIAgent {
  readonly name = "AI Agent";
  readonly role = "Autonomous general-purpose AI agent";
  readonly tools = new AgentToolRuntime();
  private readonly brain: AgentBrain;

  constructor(brain: AgentBrain = new OpenRouterBrain()) {
    this.brain = brain;
    this.tools.register(browserTool);
  }

  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim()) return { status: "needs_input", goal: task.goal, plan: [], report: "A goal is required." };
    const history: AgentAction[] = [{ type: "observe", thought: `Understand the goal: ${task.goal}` }, { type: "plan", thought: "Create and revise the plan from the goal and observations." }];
    let observation: unknown;
    let lastError = "";
    let successfulToolUse = false;
    try {
      for (let i = 0; i < 20; i++) {
        const decision = await this.brain.decide({ goal: task.goal, observation, history });
        history.push({ type: "decide", thought: decision.reason, result: decision });
        if (decision.action === "finish") {
          if (!successfulToolUse) return { status: "failed", goal: task.goal, plan: history, report: lastError || "The AI Agent could not prove that the goal was accomplished.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
          history.push({ type: "report", thought: "Report the completed work and available evidence.", result: observation });
          return { status: "completed", goal: task.goal, plan: history, report: "AI Agent completed the task with successful tool execution and evidence.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
        }
        if (!decision.tool) throw new Error("AI Agent selected a tool without a tool name.");
        try {
          const result = await this.tools.execute(decision.tool, decision.input);
          successfulToolUse = true;
          lastError = "";
          observation = result;
          history.push({ type: "use_tool", thought: decision.reason, tool: decision.tool, input: decision.input, result });
          history.push({ type: "analyze", thought: "Inspect the tool result before selecting the next action.", result });
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          observation = { error: lastError, failedTool: decision.tool, failedInput: decision.input };
          history.push({ type: "analyze", thought: `Tool failed; reconsider the strategy using this error: ${lastError}`, result: observation });
        }
      }
      return { status: "failed", goal: task.goal, plan: history, report: lastError || "AI Agent reached its action limit without proving completion.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
    } catch (error) {
      return { status: "failed", goal: task.goal, plan: history, report: error instanceof Error ? error.message : String(error), model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
    }
  }
}

export const agent = new AIAgent();
