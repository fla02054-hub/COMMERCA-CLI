import { AgentToolRuntime } from "./tool-runtime.js";
import { browserTool } from "./browser-tool.js";
import { OpenRouterBrain } from "./openrouter-brain.js";

export type AgentAction = { type: "observe" | "plan" | "use_tool" | "analyze" | "decide" | "report"; thought: string; tool?: string; input?: unknown; result?: unknown };
export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; plan: AgentAction[]; report: string };
export interface AgentBrain { decide(input: { goal: string; observation?: unknown; history: AgentAction[] }): Promise<{ action: "use_tool" | "finish"; tool?: string; input?: unknown; reason: string }>; }

class RuleBasedBrain implements AgentBrain {
  async decide(input: { goal: string; observation?: unknown; history: AgentAction[] }) {
    const url = input.goal.match(/https?:\/\/\S+/)?.[0];
    const opened = input.history.some((x) => x.type === "use_tool" && x.tool === "browser");
    if (url && !opened) return { action: "use_tool" as const, tool: "browser", input: { action: "open", url }, reason: "The goal contains a URL that must be inspected." };
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
    try {
      for (let i = 0; i < 8; i++) {
        const observation = history.at(-1)?.result;
        const decision = await this.brain.decide({ goal: task.goal, observation, history });
        history.push({ type: "decide", thought: decision.reason, result: decision });
        if (decision.action === "finish") break;
        if (!decision.tool) throw new Error("Agent selected a tool without a tool name.");
        try { const result = await this.tools.execute(decision.tool, decision.input); history.push({ type: "use_tool", thought: decision.reason, tool: decision.tool, input: decision.input, result }); history.push({ type: "analyze", thought: "Analyze the tool result before choosing the next action.", result }); }
        catch (error) { history.push({ type: "analyze", thought: `Tool failed; AI can adapt on the next decision. ${error instanceof Error ? error.message : String(error)}` }); }
      }
      history.push({ type: "report", thought: "Summarize completed actions and evidence." });
      return { status: "completed", goal: task.goal, plan: history, report: "Autonomous run completed." };
    } catch (error) { return { status: "failed", goal: task.goal, plan: history, report: error instanceof Error ? error.message : String(error) }; }
  }
}
export const agent = new CommercaAgent();
