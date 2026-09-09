import type { FlowNode, JobState, NodeConnection, NodeContext, NodeName } from "./types.js";
import { saveJob } from "./store.js";

export const FLOW: NodeName[] = ["PRODUCT", "ANALYSIS", "CONTENT", "PRODUCTION", "POST", "POST ANALYSIS"];

/** The six executable Flow Nodes. AIDEN stays outside the Flow as its manager. */
export const CONNECTIONS: NodeConnection[] = [
  { from: "PRODUCT", to: "ANALYSIS" },
  { from: "ANALYSIS", to: "CONTENT" },
  { from: "CONTENT", to: "PRODUCTION" },
  { from: "PRODUCTION", to: "POST" },
  { from: "POST", to: "POST ANALYSIS" }
];

export class FlowEngine {
  private readonly byName: Map<NodeName, FlowNode>;
  private readonly next: Map<NodeName, NodeName>;

  constructor(private readonly nodes: FlowNode[]) {
    this.validateNodes();
    this.byName = new Map(nodes.map(node => [node.name, node]));
    this.next = new Map(CONNECTIONS.map(connection => [connection.from, connection.to]));
  }

  getGraph(): { nodes: NodeName[]; connections: NodeConnection[]; entry: "AIDEN"; exit: "AIDEN" } {
    return { nodes: [...FLOW], connections: CONNECTIONS.map(connection => ({ ...connection })), entry: "AIDEN", exit: "AIDEN" };
  }

  async run(job: JobState, startNode: NodeName = "PRODUCT"): Promise<JobState> {
    let nodeName: NodeName | undefined = startNode;

    while (nodeName) {
      const node = this.byName.get(nodeName);
      if (!node) throw new Error(`Node ${nodeName} is not connected to this Flow.`);

      job.currentNode = node.name;
      job.status = "running";
      job.updatedAt = new Date().toISOString();
      job.nodeExecutions[node.name] = { status: "running", startedAt: job.updatedAt };
      job.history.push({ node: node.name, status: "started", at: job.updatedAt });
      saveJob(job);

      try {
        const context: NodeContext = { job };
        await node.execute(context);

        const completedAt = new Date().toISOString();
        job.nodeExecutions[node.name] = { status: "completed", startedAt: job.nodeExecutions[node.name]?.startedAt, completedAt };
        job.history.push({ node: node.name, status: "completed", at: completedAt });
        saveJob(job);
        nodeName = this.next.get(node.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedAt = new Date().toISOString();
        job.status = "failed";
        job.error = message;
        job.nodeExecutions[node.name] = { status: "failed", startedAt: job.nodeExecutions[node.name]?.startedAt, completedAt: failedAt, error: message };
        job.history.push({ node: node.name, status: "failed", at: failedAt, message });
        saveJob(job);
        return job;
      }
    }

    job.currentNode = null;
    job.status = "completed";
    job.error = undefined;
    job.updatedAt = new Date().toISOString();
    saveJob(job);
    return job;
  }

  async resume(job: JobState): Promise<JobState> {
    if (job.status === "completed") return job;
    const current = job.currentNode;
    if (current) return this.run(job, current);

    const lastFailed = [...job.history].reverse().find(item => item.status === "failed");
    return this.run(job, lastFailed?.node ?? "PRODUCT");
  }

  private validateNodes(): void {
    if (this.nodes.length !== FLOW.length || this.nodes.map(node => node.name).join("|") !== FLOW.join("|")) {
      throw new Error("Flow must contain exactly the six Nodes in order.");
    }

    const names = new Set(this.nodes.map(node => node.name));
    for (const connection of CONNECTIONS) {
      if (!names.has(connection.from) || !names.has(connection.to)) {
        throw new Error(`Invalid connection: ${connection.from} -> ${connection.to}`);
      }
    }

    if (CONNECTIONS.length !== FLOW.length - 1) {
      throw new Error("Flow connections must connect every adjacent Node exactly once.");
    }
  }
}
