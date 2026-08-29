import { AgentToolRuntime } from "./tool-runtime.js";
import { browserTool } from "./browser-tool.js";
import { OpenRouterBrain } from "./openrouter-brain.js";

export type AgentAction = { type: "observe" | "plan" | "use_tool" | "analyze" | "decide" | "report"; thought: string; tool?: string; input?: unknown; result?: unknown };
export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; plan: AgentAction[]; report: string; model?: string };
export interface AgentBrain { decide(input: { goal: string; observation?: unknown; history: AgentAction[] }): Promise<{ action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string }>; }

class RuleBasedBrain implements AgentBrain {
  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    const url = input.goal.match(/https?:\/\/\S+/)?.[0];
    const lastTool = [...input.history].reverse().find((x) => x.type === "use_tool");
    const failed = input.history.filter((x) => x.type === "analyze" && x.result && typeof x.result === "object" && "error" in x.result).length;
    if (url && !lastTool) return { action: "use_tool" as const, tool: "browser", input: { action: "open", url }, reason: "The goal contains a URL that must be inspected." };
    if (url && failed === 0) return { action: "use_tool" as const, tool: "browser", input: { action: "observe" }, reason: "Inspect the browser state before deciding what to do next." };
    return { action: "finish" as const, reason: "No AI brain configured; finish with available evidence." };
  }
}

export class CommercaAgent {
  readonly name = "COMMERCA Agent";
  readonly role = "Autonomous general-purpose AI agent";
  readonly tools = new AgentToolRuntime();
  private readonly brain: AgentBrain;
  constructor(brain?: AgentBrain) { this.brain = brain ?? (process.env.OPENROUTER_API_KEY ? new OpenRouterBrain() : new RuleBasedBrain()); this.tools.register(browserTool); }

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
          history.push({ type: "analyze", thought: "Tool succeeded. Feed the result back to the AI before choosing the next action.", result });
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          observation = { error: lastError, failedTool: decision.tool, failedInput: decision.input };
          history.push({ type: "analyze", thought: `Tool failed. Change strategy using this error: ${lastError}`, result: observation });
        }
      }
      return { status: "failed", goal: task.goal, plan: history, report: lastError || "Agent reached its decision limit without proving the goal was accomplished.", model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined };
    } catch (error) { return { status: "failed", goal: task.goal, plan: history, report: error instanceof Error ? error.message : String(error), model: this.brain instanceof OpenRouterBrain ? this.brain.getModel() : undefined }; }
  }
}
export const agent = new CommercaAgent();
