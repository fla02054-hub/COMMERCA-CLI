import type { Product } from "../product/types.js";
import { createRuntimeWorkflow, executeWorkflow, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";

export interface AutonomousAgentOptions {
  outputDir?: string;
  outputMp4?: string;
  maxCycles?: number;
  maxAutonomousRevisions?: number;
}

export interface AutonomousAgentResult {
  workflow: RuntimeWorkflow;
  cycles: number;
  decisions: string[];
}

async function advance(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions): Promise<RuntimeWorkflow> {
  const executeOptions = {
    outputDir: options.outputDir,
    outputMp4: options.outputMp4,
    pauseAfterQc: false,
    autonomous: true,
    maxAutonomousRevisions: options.maxAutonomousRevisions ?? 3,
  } as const;
  if (workflow.state.status === "awaiting-approval") {
    workflow.state.status = "running";
    workflow.state.approval = { ...(workflow.state.approval ?? { requestedAt: new Date().toISOString() }), approvedAt: new Date().toISOString() };
  }
  const registry = createStageRegistry({ product, outputDir: options.outputDir, outputMp4: options.outputMp4 });
  return executeWorkflow(workflow, registry, executeOptions);
}

/** User starts a job once; the supervisor owns the workflow after that. */
export async function runAutonomousAgent(goal: string, product: Product, options: AutonomousAgentOptions = {}): Promise<AutonomousAgentResult> {
  return resumeAutonomousAgent(createRuntimeWorkflow(goal), product, options);
}

/** Resume an existing job without asking the user to approve or advance stages. */
export async function resumeAutonomousAgent(workflow: RuntimeWorkflow, product: Product, options: AutonomousAgentOptions = {}): Promise<AutonomousAgentResult> {
  const maxCycles = Math.max(1, options.maxCycles ?? 3);
  const decisions: string[] = [];
  let current = workflow;
  for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
    decisions.push(`cycle ${cycle}: ${current.state.status}/${current.state.currentStage}`);
    if (current.state.status === "completed" || current.state.status === "failed") return { workflow: current, cycles: cycle, decisions };
    current = await advance(current, product, options);
    decisions.push(`cycle ${cycle}: result=${current.state.status}/${current.state.currentStage}`);
    if (current.state.status === "completed" || current.state.status === "failed") return { workflow: current, cycles: cycle, decisions };
  }
  return { workflow: current, cycles: maxCycles, decisions };
}
