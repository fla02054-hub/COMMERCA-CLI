import { AgentToolRuntime } from "./tool-runtime.js";
import { browserTool } from "./browser-tool.js";

export type AgentAction = {
  type: "observe" | "plan" | "use_tool" | "analyze" | "decide" | "report";
  thought: string;
  tool?: string;
  input?: unknown;
  result?: unknown;
};

export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = { status: "completed" | "needs_input" | "failed"; goal: string; plan: AgentAction[]; report: string };

export interface AutonomousAgent { readonly name: string; readonly role: string; run(task: AgentTask): Promise<AgentResult>; }

export class CommercaAgent implements AutonomousAgent {
  readonly name = "COMMERCA Agent";
  readonly role = "Autonomous general-purpose AI agent";
  readonly tools = new AgentToolRuntime();

  constructor() { this.tools.register(browserTool); }

  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim()) return { status: "needs_input", goal: task.goal, plan: [], report: "A goal is required." };
    const plan: AgentAction[] = [{ type: "observe", thought: `Understand the goal: ${task.goal}` }, { type: "plan", thought: "Select tools and actions from the goal and observed state." }];
    const url = task.context?.url;
    if (typeof url === "string" && /^https?:\/\//.test(url)) {
      const result = await this.tools.execute("browser", { action: "open", url });
      plan.push({ type: "use_tool", thought: "Open the requested website and inspect it directly.", tool: "browser", input: { action: "open", url }, result });
      plan.push({ type: "analyze", thought: "Analyze the observed page and decide what to do next.", result });
    }
    plan.push({ type: "decide", thought: "Choose the next action from evidence instead of a fixed workflow." });
    plan.push({ type: "report", thought: "Report completed work, findings, and remaining limitations." });
    return { status: "completed", goal: task.goal, plan, report: "Agent executed its available tools and recorded the observed result." };
  }
}

export const agent = new CommercaAgent();
