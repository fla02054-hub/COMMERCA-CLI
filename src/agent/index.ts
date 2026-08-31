import type { Product } from "../product/types.js";
import { runAutonomousAgent, type AutonomousAgentResult } from "../runtime/autonomous-agent.js";

export type AgentTask = { goal: string; context?: Record<string, unknown> };
export type AgentResult = {
  status: "completed" | "needs_input" | "failed";
  goal: string;
  report: string;
  decisions?: string[];
  cycles?: number;
};

function productFromContext(task: AgentTask): Product | undefined {
  const value = task.context?.product;
  if (!value || typeof value !== "object") return undefined;
  const product = value as Partial<Product>;
  if (!product.name || typeof product.name !== "string") return undefined;
  if (typeof product.price !== "number" || typeof product.originalPrice !== "number" || typeof product.url !== "string") return undefined;
  return product as Product;
}

/**
 * The single AI Agent entry point. Gemini is the decision-making brain in
 * runtime/autonomous-agent.ts. This facade exists only so external channels
 * such as Discord have one stable Agent API; it contains no second brain,
 * workflow, browser loop, or business rules.
 */
export class AIAgent {
  readonly name = "AI Agent";
  readonly role = "Autonomous AI agent operating COMMERCA on behalf of the user";

  async run(task: AgentTask): Promise<AgentResult> {
    if (!task.goal.trim()) return { status: "needs_input", goal: task.goal, report: "A goal is required." };
    const product = productFromContext(task);
    if (!product) {
      return { status: "needs_input", goal: task.goal, report: "Product input is required: name, price, originalPrice, and url." };
    }

    const result: AutonomousAgentResult = await runAutonomousAgent(task.goal, product, {
      apiKey: typeof task.context?.geminiApiKey === "string" ? task.context.geminiApiKey : undefined,
      model: typeof task.context?.geminiModel === "string" ? task.context.geminiModel : undefined,
      outputDir: typeof task.context?.outputDir === "string" ? task.context.outputDir : undefined,
      outputMp4: typeof task.context?.outputMp4 === "string" ? task.context.outputMp4 : undefined,
      maxCycles: 20,
      maxAutonomousRevisions: 5,
    });

    return {
      status: result.workflow.state.status === "completed" ? "completed" : "failed",
      goal: task.goal,
      report: JSON.stringify({ status: result.workflow.state.status, currentStage: result.workflow.state.currentStage, decisions: result.decisions }, null, 2),
      decisions: result.decisions,
      cycles: result.cycles,
    };
  }
}

export const agent = new AIAgent();
