import type { Product } from "../product/types.js";
import { continueWorkflow, runWorkflowWithProduct } from "./index.js";
import type { RuntimeWorkflow } from "./flow.js";

export interface AutonomousAgentOptions {
  outputDir?: string;
  outputMp4?: string;
  maxCycles?: number;
}

export interface AutonomousAgentResult {
  workflow: RuntimeWorkflow;
  cycles: number;
  decisions: string[];
}

/**
 * Supervisor agent: the user starts a job once; the agent owns the workflow
 * from there. It automatically releases the QC approval gate and records each
 * autonomous decision. A cycle is deliberately bounded so a broken provider
 * cannot spin forever or consume unlimited tokens.
 */
export async function runAutonomousAgent(
  goal: string,
  product: Product,
  options: AutonomousAgentOptions = {},
): Promise<AutonomousAgentResult> {
  const maxCycles = Math.max(1, options.maxCycles ?? 3);
  const decisions: string[] = [];
  let workflow = await runWorkflowWithProduct(goal, product, {
    outputDir: options.outputDir,
    outputMp4: options.outputMp4,
    pauseAfterQc: false,
  });

  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    decisions.push(`cycle ${cycle}: ${workflow.state.status}`);
    if (workflow.state.status === "completed") return { workflow, cycles: cycle, decisions };
    if (workflow.state.status === "awaiting-approval") {
      decisions.push(`cycle ${cycle}: autonomous QC approval`);
      workflow = await continueWorkflow(workflow, product, {
        outputDir: options.outputDir,
        outputMp4: options.outputMp4,
        pauseAfterQc: false,
      });
      continue;
    }
    if (workflow.state.status === "failed") {
      decisions.push(`cycle ${cycle}: stop on non-QC failure`);
      break;
    }
  }

  return { workflow, cycles: maxCycles, decisions };
}
