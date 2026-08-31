export type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export interface NodeDefinition<TData = unknown> { id: string; type: string; next?: string[]; disabled?: boolean; parameters?: Record<string, unknown>; retry?: { maxAttempts?: number; waitMs?: number }; continueOnFail?: boolean; execute: (context: NodeExecutionContext<TData>) => Promise<NodeExecutionResult<TData>>; }
export interface NodeExecutionContext<TData = unknown> { executionId: string; node: NodeDefinition<TData>; input: TData; data: Record<string, unknown>; outputs: Record<string, unknown>; attempt: number; signal?: AbortSignal; }
export interface NodeExecutionResult<TData = unknown> { output?: TData; data?: Record<string, unknown>; next?: string[]; }
export interface NodeExecutionState { id: string; status: NodeStatus; attempts: number; error?: string; startedAt?: string; completedAt?: string; }
export interface GraphExecution<TData = unknown> { id: string; status: "running" | "completed" | "failed"; currentNode?: string; input: TData; data: Record<string, unknown>; outputs: Record<string, unknown>; nodes: Record<string, NodeExecutionState>; history: string[]; }
export interface GraphRunOptions { maxSteps?: number; signal?: AbortSignal; startNode?: string; chooseNext?: (context: NodeExecutionContext, result: NodeExecutionResult) => Promise<string[] | undefined>; }

export class WorkflowGraphEngine {
  private readonly nodes = new Map<string, NodeDefinition>();
  register<TData>(node: NodeDefinition<TData>): this { if (this.nodes.has(node.id)) throw new Error(`Workflow node already registered: ${node.id}`); this.nodes.set(node.id, node as NodeDefinition); return this; }
  registerMany(nodes: NodeDefinition[]): this { for (const node of nodes) this.register(node); return this; }
  get(id: string): NodeDefinition { const node = this.nodes.get(id); if (!node) throw new Error(`Workflow node not registered: ${id}`); return node; }
  has(id: string): boolean { return this.nodes.has(id); }
  list(): NodeDefinition[] { return [...this.nodes.values()]; }
  validate(startNode: string): void { if (!this.nodes.has(startNode)) throw new Error(`Workflow start node not registered: ${startNode}`); for (const node of this.nodes.values()) for (const next of node.next ?? []) if (!this.nodes.has(next)) throw new Error(`Workflow node ${node.id} points to missing node: ${next}`); }
  async run<TData>(input: TData, options: GraphRunOptions = {}): Promise<GraphExecution<TData>> {
    const startNode = options.startNode ?? this.list()[0]?.id; if (!startNode) throw new Error("Workflow has no nodes."); this.validate(startNode);
    const initialData = input && typeof input === "object" ? { ...(input as Record<string, unknown>) } : {};
    const execution: GraphExecution<TData> = { id: crypto.randomUUID(), status: "running", currentNode: startNode, input, data: initialData, outputs: {}, nodes: Object.fromEntries(this.list().map(n => [n.id, { id: n.id, status: "pending", attempts: 0 }])), history: [] };
    const queue: string[] = [startNode]; const queued = new Set(queue); const maxSteps = Math.max(1, options.maxSteps ?? 1000); let steps = 0;
    while (queue.length) {
      if (++steps > maxSteps) { execution.status = "failed"; throw new Error(`Workflow execution exceeded ${maxSteps} steps.`); }
      if (options.signal?.aborted) { execution.status = "failed"; throw new Error("Workflow execution aborted."); }
      const id = queue.shift()!; queued.delete(id); const node = this.get(id); const state = execution.nodes[id]; execution.currentNode = id; execution.history.push(id);
      if (node.disabled) { state.status = "skipped"; continue; }
      state.status = "running"; state.startedAt = new Date().toISOString(); const maxAttempts = Math.max(1, node.retry?.maxAttempts ?? 1); let completed = false; let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        state.attempts = attempt;
        try {
          const context: NodeExecutionContext = { executionId: execution.id, node, input, data: execution.data, outputs: execution.outputs, attempt, signal: options.signal };
          const result = await node.execute(context); if (result.output !== undefined) execution.outputs[id] = result.output; if (result.data) Object.assign(execution.data, result.data);
          state.status = "completed"; state.completedAt = new Date().toISOString(); const next = await options.chooseNext?.(context, result) ?? result.next ?? node.next ?? [];
          for (const nextId of next) { this.get(nextId); if (!queued.has(nextId)) { queue.push(nextId); queued.add(nextId); } } completed = true; break;
        } catch (error) { lastError = error; if (attempt < maxAttempts && (node.retry?.waitMs ?? 0) > 0) await new Promise(r => setTimeout(r, node.retry!.waitMs)); }
      }
      if (!completed) { state.status = "failed"; state.error = lastError instanceof Error ? lastError.message : String(lastError); if (!node.continueOnFail) { execution.status = "failed"; return execution; } }
    }
    execution.currentNode = undefined; execution.status = "completed"; return execution;
  }
}
