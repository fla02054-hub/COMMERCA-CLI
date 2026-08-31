export type JsonValue = unknown;

export type NodeKind =
  | "trigger" | "input" | "ai" | "transform" | "condition" | "router"
  | "tool" | "http" | "wait" | "approval" | "loop" | "output";

export interface ExecutionContext {
  input: JsonValue;
  data: Record<string, JsonValue>;
  outputs: Record<string, JsonValue>;
  meta: { executionId: string; workflowId: string; startedAt: string };
}

export interface NodeResult {
  output?: JsonValue;
  next?: string[];
  wait?: boolean;
  error?: string;
}

export interface WorkflowNode {
  id: string;
  type: NodeKind;
  name?: string;
  next?: string[];
  retry?: number;
  disabled?: boolean;
  continueOnFail?: boolean;
  config?: Record<string, JsonValue>;
  execute?: (ctx: ExecutionContext, node: WorkflowNode) => Promise<NodeResult | JsonValue>;
}

export interface WorkflowDefinition {
  id: string;
  version: number;
  start: string[];
  nodes: Record<string, WorkflowNode>;
  settings?: { maxIterations?: number };
}

export interface ExecutionRecord {
  nodeId: string;
  status: "running" | "success" | "error" | "skipped" | "waiting";
  attempts: number;
  output?: JsonValue;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ExecutionResult {
  executionId: string;
  status: "success" | "error" | "waiting";
  outputs: Record<string, JsonValue>;
  records: ExecutionRecord[];
}

export type NodeHandler = (ctx: ExecutionContext, node: WorkflowNode) => Promise<NodeResult | JsonValue>;

export class NodeRegistry {
  private handlers = new Map<NodeKind, NodeHandler>();
  register(type: NodeKind, handler: NodeHandler): this {
    this.handlers.set(type, handler);
    return this;
  }
  has(type: NodeKind): boolean { return this.handlers.has(type); }
  get(type: NodeKind): NodeHandler {
    const handler = this.handlers.get(type);
    if (!handler) throw new Error(`No node handler registered for: ${type}`);
    return handler;
  }
}

export class N8nLikeEngine {
  constructor(private readonly registry: NodeRegistry, private readonly maxIterations = 1000) {}

  async execute(workflow: WorkflowDefinition, input: JsonValue, executionId = crypto.randomUUID()): Promise<ExecutionResult> {
    const ctx: ExecutionContext = {
      input,
      data: { input },
      outputs: {},
      meta: { executionId, workflowId: workflow.id, startedAt: new Date().toISOString() },
    };
    const records: ExecutionRecord[] = [];
    const queue = [...workflow.start];
    const max = workflow.settings?.maxIterations ?? this.maxIterations;
    let iterations = 0;

    while (queue.length) {
      if (++iterations > max) return { executionId, status: "error", outputs: ctx.outputs, records: [...records, { nodeId: "__engine__", status: "error", attempts: 0, error: "Maximum workflow iterations exceeded", startedAt: new Date().toISOString() }] };
      const nodeId = queue.shift()!;
      const node = workflow.nodes[nodeId];
      if (!node) throw new Error(`Workflow references missing node: ${nodeId}`);
      if (node.disabled) {
        records.push({ nodeId, status: "skipped", attempts: 0, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
        continue;
      }

      const record: ExecutionRecord = { nodeId, status: "running", attempts: 0, startedAt: new Date().toISOString() };
      records.push(record);
      const attempts = Math.max(1, node.retry ?? 0 + 1);
      let succeeded = false;

      for (let attempt = 1; attempt <= attempts; attempt++) {
        record.attempts = attempt;
        try {
          const handler = node.execute ?? this.registry.get(node.type);
          const raw = await handler(ctx, node);
          const result: NodeResult = raw && typeof raw === "object" && ("output" in (raw as object) || "next" in (raw as object) || "wait" in (raw as object) || "error" in (raw as object))
            ? raw as NodeResult : { output: raw };
          if (result.error) throw new Error(result.error);
          if (result.output !== undefined) {
            ctx.outputs[nodeId] = result.output;
            ctx.data[nodeId] = result.output;
            record.output = result.output;
          }
          if (result.wait) {
            record.status = "waiting";
            record.finishedAt = new Date().toISOString();
            return { executionId, status: "waiting", outputs: ctx.outputs, records };
          }
          record.status = "success";
          record.finishedAt = new Date().toISOString();
          for (const next of result.next ?? node.next ?? []) if (!queue.includes(next)) queue.push(next);
          succeeded = true;
          break;
        } catch (error) {
          record.error = error instanceof Error ? error.message : String(error);
          if (attempt === attempts && !node.continueOnFail) {
            record.status = "error";
            record.finishedAt = new Date().toISOString();
            return { executionId, status: "error", outputs: ctx.outputs, records };
          }
        }
      }
      if (!succeeded && node.continueOnFail) {
        record.status = "success";
        record.finishedAt = new Date().toISOString();
        for (const next of node.next ?? []) if (!queue.includes(next)) queue.push(next);
      }
    }
    return { executionId, status: "success", outputs: ctx.outputs, records };
  }
}
