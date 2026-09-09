import type { FlowNode, JobState, NodeConnection, NodeContext, NodeName, NodePayload, WorkflowDefinition } from "./types.js";
import { saveJob } from "./store.js";
import { DEFAULT_WORKFLOW } from "./workflow.js";
import { NodeRegistry } from "./registry.js";

export const FLOW: NodeName[] = [...DEFAULT_WORKFLOW.nodes];
export const CONNECTIONS: NodeConnection[] = DEFAULT_WORKFLOW.connections.map(c => ({ ...c }));

export interface RunOptions {
  maxAttempts?: number;
  dryRun?: boolean;
  timeoutMs?: number;
}

export class FlowEngine {
  private readonly next = new Map<NodeName, NodeConnection>();
  private readonly previous = new Map<NodeName, NodeConnection>();
  private readonly registry: NodeRegistry;

  constructor(nodes: readonly FlowNode[], private readonly workflow: WorkflowDefinition = DEFAULT_WORKFLOW) {
    this.registry = new NodeRegistry();
    this.registry.registerAll(nodes);
    for (const c of workflow.connections) {
      this.next.set(c.from, c);
      this.previous.set(c.to, c);
    }
    this.validateGraph();
  }

  getGraph() {
    return {
      admin: "AIDEN",
      workflow: this.workflow.name,
      version: this.workflow.version,
      nodes: [...this.workflow.nodes],
      connections: this.workflow.connections.map(c => ({ ...c })),
      entry: "AIDEN -> PRODUCT",
      exit: "POST ANALYSIS -> AIDEN"
    } as const;
  }

  getWorkflow(): WorkflowDefinition {
    return {
      name: this.workflow.name,
      version: this.workflow.version,
      nodes: [...this.workflow.nodes],
      connections: this.workflow.connections.map(c => ({ ...c }))
    };
  }

  validate(): void { this.validateGraph(); }

  plan(startNode: NodeName = this.workflow.nodes[0]): NodeName[] {
    if (!this.workflow.nodes.includes(startNode)) throw new Error(`Unknown workflow node: ${startNode}`);
    const result: NodeName[] = [];
    let current: NodeName | undefined = startNode;
    while (current) {
      result.push(current);
      current = this.next.get(current)?.to;
    }
    return result;
  }

  async run(job: JobState, startNode: NodeName = this.workflow.nodes[0], initialInput: NodePayload = job.input, options: RunOptions = {}): Promise<JobState> {
    const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 1));
    const timeoutMs = options.timeoutMs === undefined ? 0 : Math.max(1, Math.floor(options.timeoutMs));
    job.nodeData ??= {};
    job.nodeExecutions ??= {};
    job.history ??= [];
    job.workflowName = this.workflow.name;
    job.workflowVersion = this.workflow.version;

    if (options.dryRun) {
      job.status = "completed";
      job.currentNode = null;
      job.error = undefined;
      job.history.push({ node: startNode, status: "completed", at: new Date().toISOString(), message: `DRY RUN: ${this.plan(startNode).join(" -> ")}` });
      saveJob(job);
      return job;
    }

    let nodeName: NodeName | undefined = startNode;
    let input: NodePayload = initialInput;
    job.status = "running";
    job.error = undefined;
    saveJob(job);

    while (nodeName) {
      const node = this.registry.get(nodeName);
      const previousAttempt = job.nodeExecutions[node.name]?.attempt ?? 0;
      const startedAt = new Date().toISOString();
      job.currentNode = node.name;
      job.status = "running";
      job.nodeExecutions[node.name] = { status: "running", attempt: previousAttempt + 1, startedAt };
      job.history.push({ node: node.name, status: "started", at: startedAt, attempt: previousAttempt + 1 });
      saveJob(job);

      try {
        let output: NodePayload | undefined;
        let lastError: Error | undefined;
        let usedAttempts = 0;

        for (let i = 1; i <= maxAttempts; i++) {
          usedAttempts = i;
          const controller = new AbortController();
          try {
            const context: NodeContext = {
              job,
              input,
              attempt: previousAttempt + i,
              executionId: job.executionId,
              workflowName: this.workflow.name,
              workflowVersion: this.workflow.version,
              signal: controller.signal
            };
            output = await this.executeWithTimeout(node, context, timeoutMs, controller);
            break;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (i < maxAttempts) {
              job.history.push({ node: node.name, status: "started", at: new Date().toISOString(), attempt: previousAttempt + i + 1, message: `retry after: ${lastError.message}` });
              saveJob(job);
            }
          }
        }

        if (!output) throw lastError ?? new Error(`Node ${node.name} produced no output.`);
        this.validateOutput(node, output);
        job.nodeData[node.name] = output;
        this.syncTypedData(job, node.name, output);

        const completedAt = new Date().toISOString();
        job.nodeExecutions[node.name] = { status: "completed", attempt: previousAttempt + usedAttempts, startedAt, completedAt };
        job.history.push({ node: node.name, status: "completed", at: completedAt, attempt: previousAttempt + usedAttempts });
        saveJob(job);

        const connection = this.next.get(node.name);
        if (!connection) {
          job.currentNode = null;
          job.status = "completed";
          saveJob(job);
          return job;
        }

        const nextValue = output[connection.output];
        if (nextValue === undefined) throw new Error(`Node ${node.name} output ${connection.output} is undefined.`);
        input = { [connection.input]: nextValue };
        nodeName = connection.to;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedAt = new Date().toISOString();
        job.status = "failed";
        job.error = message;
        job.nodeExecutions[node.name] = { status: "failed", attempt: previousAttempt + maxAttempts, startedAt, completedAt: failedAt, error: message };
        job.history.push({ node: node.name, status: "failed", at: failedAt, attempt: previousAttempt + maxAttempts, message });
        saveJob(job);
        return job;
      }
    }
    return job;
  }

  async resume(job: JobState, options: RunOptions = {}): Promise<JobState> {
    if (job.status === "completed") return job;
    const node = job.currentNode ?? [...job.history].reverse().find(h => h.status === "failed")?.node ?? this.workflow.nodes[0];
    const connection = this.previous.get(node);
    const input = connection ? { [connection.input]: job.nodeData[connection.from]?.[connection.output] } : job.input;
    return this.run(job, node, input, options);
  }

  private async executeWithTimeout(node: FlowNode, context: NodeContext, timeoutMs: number, controller: AbortController): Promise<NodePayload> {
    const execution = node.execute(context);
    if (!timeoutMs) return execution;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        execution,
        new Promise<NodePayload>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`Node ${node.name} timed out after ${timeoutMs}ms.`));
          }, timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private validateGraph(): void {
    if (!this.workflow.nodes.length) throw new Error("Workflow must contain at least one node.");
    if (new Set(this.workflow.nodes).size !== this.workflow.nodes.length) throw new Error("Workflow contains duplicate nodes.");
    for (const name of this.workflow.nodes) if (!this.registry.has(name)) throw new Error(`Workflow node is not registered: ${name}`);
    if (this.workflow.connections.length !== this.workflow.nodes.length - 1) throw new Error("Linear workflow must have exactly nodes - 1 connections.");
    const incoming = new Set<NodeName>();
    const outgoing = new Set<NodeName>();
    for (const c of this.workflow.connections) {
      if (!this.workflow.nodes.includes(c.from) || !this.workflow.nodes.includes(c.to)) throw new Error(`Invalid connection: ${c.from} -> ${c.to}`);
      if (outgoing.has(c.from)) throw new Error(`Node has multiple outgoing connections: ${c.from}`);
      if (incoming.has(c.to)) throw new Error(`Node has multiple incoming connections: ${c.to}`);
      const from = this.registry.get(c.from);
      const to = this.registry.get(c.to);
      if (!from.outputPorts.some(p => p.name === c.output)) throw new Error(`Missing output port ${c.from}.${c.output}`);
      if (!to.inputPorts.some(p => p.name === c.input)) throw new Error(`Missing input port ${c.to}.${c.input}`);
      outgoing.add(c.from); incoming.add(c.to);
    }
    const reachable = new Set<NodeName>();
    let current: NodeName | undefined = this.workflow.nodes[0];
    while (current) {
      if (reachable.has(current)) throw new Error(`Workflow contains a cycle at ${current}.`);
      reachable.add(current);
      current = this.next.get(current)?.to;
    }
    if (reachable.size !== this.workflow.nodes.length) throw new Error("Workflow must be one connected linear graph.");
  }

  private validateOutput(node: FlowNode, output: NodePayload): void {
    if (!output || typeof output !== "object" || Array.isArray(output)) throw new Error(`Node ${node.name} must return an object payload.`);
    for (const p of node.outputPorts) if (p.required !== false && !(p.name in output)) throw new Error(`Node ${node.name} did not produce required output port ${p.name}.`);
  }

  private syncTypedData(job: JobState, node: NodeName, output: NodePayload): void {
    if (node === "PRODUCT") job.product = output.product as JobState["product"];
    if (node === "ANALYSIS") job.analysis = output.analysis as JobState["analysis"];
    if (node === "CONTENT") job.content = output.content as JobState["content"];
    if (node === "PRODUCTION") job.production = output.production as JobState["production"];
    if (node === "POST") job.post = output.post as JobState["post"];
    if (node === "POST ANALYSIS") job.postAnalysis = output.analysis as JobState["postAnalysis"];
  }
}
