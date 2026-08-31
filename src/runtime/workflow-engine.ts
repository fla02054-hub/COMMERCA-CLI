import { executeWorkflow, createRuntimeWorkflow, type ExecuteWorkflowOptions, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { Product } from "../product/types.js";
import type { WorkflowStage } from "./workflow-schema.js";

/** COMMERCA's n8n-style workflow definition. Aiden is only an input channel. */
export interface WorkflowNode { id: string; stage: WorkflowStage; next: string[]; retry?: number; provider?: string; }
export interface WorkflowDefinition { id: "commerca-product-workflow"; start: "product-input"; nodes: Record<string, WorkflowNode>; }

export const COMMERCA_WORKFLOW: WorkflowDefinition = {
  id: "commerca-product-workflow",
  start: "product-input",
  nodes: {
    "product-input": { id: "product-input", stage: "product-input", next: ["product-analysis"] },
    "product-analysis": { id: "product-analysis", stage: "product-analysis", next: ["content-creative"] },
    "content-creative": { id: "content-creative", stage: "content-creative", next: ["production"] },
    production: { id: "production", stage: "production", next: ["qc"], provider: "adapter" },
    qc: { id: "qc", stage: "qc", next: ["final-package", "production", "content-creative"] },
    "final-package": { id: "final-package", stage: "final-package", next: [] },
  },
};

export interface ProviderAdapter<T = unknown> { readonly id: string; execute(input: T): Promise<unknown>; }

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  register(adapter: ProviderAdapter): this {
    if (this.adapters.has(adapter.id)) throw new Error(`Provider adapter already registered: ${adapter.id}`);
    this.adapters.set(adapter.id, adapter); return this;
  }
  get(id: string): ProviderAdapter {
    const adapter = this.adapters.get(id);
    if (!adapter) throw new Error(`Provider adapter not registered: ${id}`);
    return adapter;
  }
  has(id: string): boolean { return this.adapters.has(id); }
}

/** Single execution entrypoint for the COMMERCA workflow engine. */
export class WorkflowEngine {
  readonly definition = COMMERCA_WORKFLOW;
  async run(goal: string, product: Product, options: ExecuteWorkflowOptions = {}): Promise<RuntimeWorkflow> {
    const workflow = createRuntimeWorkflow(goal);
    const registry = createStageRegistry({ product, outputDir: options.outputDir, outputMp4: options.outputMp4 });
    return executeWorkflow(workflow, registry, options);
  }
}

export function createWorkflowEngine(): WorkflowEngine { return new WorkflowEngine(); }
