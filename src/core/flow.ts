import type { FlowNode, JobState, NodeConnection, NodeContext, NodeName, NodePayload } from "./types.js";
import { saveJob } from "./store.js";

export const FLOW: NodeName[] = ["PRODUCT", "ANALYSIS", "CONTENT", "PRODUCTION", "POST", "POST ANALYSIS"];

/** AIDEN is the Admin boundary. Only the six entries below are executable Flow Nodes. */
export const CONNECTIONS: NodeConnection[] = [
  { from: "PRODUCT", output: "product", to: "ANALYSIS", input: "product" },
  { from: "ANALYSIS", output: "analysis", to: "CONTENT", input: "analysis" },
  { from: "CONTENT", output: "content", to: "PRODUCTION", input: "content" },
  { from: "PRODUCTION", output: "production", to: "POST", input: "production" },
  { from: "POST", output: "post", to: "POST ANALYSIS", input: "post" }
];

export class FlowEngine {
  private readonly byName: Map<NodeName, FlowNode>;
  private readonly next: Map<NodeName, NodeConnection>;

  constructor(private readonly nodes: FlowNode[]) {
    this.validateGraph();
    this.byName = new Map(nodes.map(node => [node.name, node]));
    this.next = new Map(CONNECTIONS.map(connection => [connection.from, connection]));
  }

  getGraph() {
    return {
      admin: "AIDEN",
      nodes: [...FLOW],
      connections: CONNECTIONS.map(connection => ({ ...connection })),
      entry: "AIDEN -> PRODUCT",
      exit: "POST ANALYSIS -> AIDEN"
    } as const;
  }

  async run(job: JobState, startNode: NodeName = "PRODUCT", initialInput: NodePayload = job.input): Promise<JobState> {
    let nodeName: NodeName | undefined = startNode;
    let input: NodePayload = initialInput;

    job.status = "running";
    job.error = undefined;
    job.updatedAt = new Date().toISOString();
    saveJob(job);

    while (nodeName) {
      const node = this.byName.get(nodeName);
      if (!node) throw new Error(`Node ${nodeName} is not part of the Flow.`);

      const startedAt = new Date().toISOString();
      job.currentNode = node.name;
      job.status = "running";
      job.nodeExecutions[node.name] = { status: "running", startedAt };
      job.history.push({ node: node.name, status: "started", at: startedAt });
      saveJob(job);

      try {
        const output = await node.execute({ job, input });
        this.validateOutput(node, output);
        job.nodeData[node.name] = output;

        const completedAt = new Date().toISOString();
        job.nodeExecutions[node.name] = { status: "completed", startedAt, completedAt };
        job.history.push({ node: node.name, status: "completed", at: completedAt });
        job.updatedAt = completedAt;
        saveJob(job);

        const connection = this.next.get(node.name);
        if (!connection) {
          job.currentNode = null;
          job.status = "completed";
          saveJob(job);
          return job;
        }

        input = { [connection.input]: output[connection.output] };
        nodeName = connection.to;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failedAt = new Date().toISOString();
        job.status = "failed";
        job.error = message;
        job.nodeExecutions[node.name] = { status: "failed", startedAt, completedAt: failedAt, error: message };
        job.history.push({ node: node.name, status: "failed", at: failedAt, message });
        job.updatedAt = failedAt;
        saveJob(job);
        return job;
      }
    }

    return job;
  }

  async resume(job: JobState): Promise<JobState> {
    if (job.status === "completed") return job;
    const node = job.currentNode ?? [...job.history].reverse().find(item => item.status === "failed")?.node ?? "PRODUCT";
    const previous = FLOW[Math.max(0, FLOW.indexOf(node) - 1)];
    const connection = previous ? this.next.get(previous) : undefined;
    const input = previous && connection ? { [connection.input]: job.nodeData[previous]?.[connection.output] } : job.input;
    return this.run(job, node, input);
  }

  private validateGraph(): void {
    if (this.nodes.length !== FLOW.length || this.nodes.map(node => node.name).join("|") !== FLOW.join("|")) {
      throw new Error("Flow must contain exactly the six Nodes in order.");
    }

    const names = new Set(this.nodes.map(node => node.name));
    if (CONNECTIONS.length !== FLOW.length - 1) throw new Error("Flow must have exactly five Node connections.");

    for (const connection of CONNECTIONS) {
      const from = this.byNameSafe(connection.from);
      const to = this.byNameSafe(connection.to);
      if (!names.has(connection.from) || !names.has(connection.to)) throw new Error(`Invalid connection: ${connection.from} -> ${connection.to}`);
      if (!from.outputPorts.some(port => port.name === connection.output)) throw new Error(`Missing output port ${connection.from}.${connection.output}`);
      if (!to.inputPorts.some(port => port.name === connection.input)) throw new Error(`Missing input port ${connection.to}.${connection.input}`);
    }
  }

  private byNameSafe(name: NodeName): FlowNode {
    const node = this.nodes.find(item => item.name === name);
    if (!node) throw new Error(`Missing Node ${name}.`);
    return node;
  }

  private validateOutput(node: FlowNode, output: NodePayload): void {
    for (const port of node.outputPorts) {
      if (!(port.name in output)) throw new Error(`Node ${node.name} did not produce required output port ${port.name}.`);
    }
  }
}
