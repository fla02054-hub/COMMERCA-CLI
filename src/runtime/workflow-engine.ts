import { executeWorkflow, createRuntimeWorkflow, type ExecuteWorkflowOptions, type RuntimeWorkflow } from "./flow.js";
import { createStageRegistry } from "./stage-registry.js";
import type { Product } from "../product/types.js";
import type { WorkflowStage } from "./workflow-schema.js";

/**
 * Generic node model for COMMERCA's n8n-like workflow engine.
 * A node is not a business stage: it is an executable unit with explicit
 * outgoing edges. The engine can therefore run arbitrary graphs without
 * requiring Research/Analysis/Content/Creative as fixed workflow stages.
 */
export interface WorkflowNode<TContext = unknown> {
  id: string;
  next: string[];
  execute?: (context: TContext) => Promise<unknown> | unknown;
  retry?: number;
  continueOnFail?: boolean;
  disabled?: boolean;
  provider?: string;
  /** Legacy COMMERCA adapter stage. Kept for compatibility with existing workflows. */
  stage?: WorkflowStage;
}

export interface WorkflowDefinition<TContext = unknown> {
  id: string;
  start: string;
  nodes: Record<string, WorkflowNode<TContext>>;
}

export interface GraphExecutionContext<T = unknown> {
  data: T;
  nodeId: string;
  outputs: Record<string, unknown>;
  history: string[];
}

export interface GraphExecutionResult {
  outputs: Record<string, unknown>;
  history: string[];
  failed?: { nodeId: string; error: string };
}

/** Default product workflow. The graph is intentionally compact; the AI agent
 * decides what work is needed inside the executable nodes rather than exposing
 * Research/Analysis/Content/Creative as user-facing stages. */
export const COMMERCA_WORKFLOW: WorkflowDefinition = {
  id: "commerca-product-workflow",
  start: "product-input",
  nodes: {
    "product-input": { id: "product-input", stage: "product-input", next: ["ai-agent"] },
    "ai-agent": { id: "ai-agent", stage: "content-creative", next: ["production"] },
    production: { id: "production", stage: "production", next: ["qc"], provider: "adapter" },
    qc: { id: "qc", stage: "qc", next: ["final-package", "production", "ai-agent"] },
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

/** Generic graph executor: nodes, branches, retries and failure isolation. */
export async function executeGraph<T>(definition: WorkflowDefinition<GraphExecutionContext<T>>, data: T, options: { maxIterations?: number } = {}): Promise<GraphExecutionResult> {
  if (!definition.start || !definition.nodes[definition.start]) throw new Error(`Workflow start node not found: ${definition.start}`);
  const outputs: Record<string, unknown> = {};
  const history: string[] = [];
  const queue = [definition.start];
  const maxIterations = options.maxIterations ?? 1000;
  let iterations = 0;

  while (queue.length && iterations++ < maxIterations) {
    const nodeId = queue.shift()!;
    const node = definition.nodes[nodeId];
    if (!node) return { outputs, history, failed: { nodeId, error: `Workflow node not found: ${nodeId}` } };
    if (node.disabled) continue;

    history.push(nodeId);
    if (node.execute) {
      const attempts = Math.max(1, (node.retry ?? 0) + 1);
      let completed = false;
      let lastError: unknown;
      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          outputs[nodeId] = await node.execute({ data, nodeId, outputs, history });
          completed = true;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!completed && !node.continueOnFail) {
        return { outputs, history, failed: { nodeId, error: lastError instanceof Error ? lastError.message : String(lastError) } };
      }
      if (!completed) outputs[nodeId] = { error: lastError instanceof Error ? lastError.message : String(lastError) };
    }
    queue.push(...node.next);
  }

  if (iterations >= maxIterations) return { outputs, history, failed: { nodeId: history.at(-1) ?? definition.start, error: "Workflow iteration limit exceeded." } };
  return { outputs, history };
}

/** Compatibility entrypoint for the existing COMMERCA product runtime. */
export class WorkflowEngine {
  readonly definition = COMMERCA_WORKFLOW;
  async run(goal: string, product: Product, options: ExecuteWorkflowOptions = {}): Promise<RuntimeWorkflow> {
    const workflow = createRuntimeWorkflow(goal);
    const registryOptions = { product, ...(options.outputDir !== undefined ? { outputDir: options.outputDir } : {}), ...(options.outputMp4 !== undefined ? { outputMp4: options.outputMp4 } : {}) };
    const registry = createStageRegistry(registryOptions);
    return executeWorkflow(workflow, registry, options);
  }
}

export function createWorkflowEngine(): WorkflowEngine { return new WorkflowEngine(); }
