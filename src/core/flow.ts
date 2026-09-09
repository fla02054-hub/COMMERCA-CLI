import type { FlowNode, JobState, NodeContext, NodeName } from "./types.js";
import { saveJob } from "./store.js";

export const FLOW: NodeName[] = ["PRODUCT", "ANALYSIS", "CONTENT", "PRODUCTION", "POST", "POST ANALYSIS"];

export class FlowEngine {
  constructor(private readonly nodes: FlowNode[]) {
    if (nodes.map(n => n.name).join("|") !== FLOW.join("|")) throw new Error("Flow must contain exactly the six Nodes in order.");
  }

  async run(job: JobState, startAt = 0): Promise<JobState> {
    for (let i = startAt; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      job.currentNode = node.name;
      job.status = "running";
      job.history.push({ node: node.name, status: "started", at: new Date().toISOString() });
      saveJob(job);
      try {
        const context: NodeContext = { job };
        await node.execute(context);
        job.history.push({ node: node.name, status: "completed", at: new Date().toISOString() });
        saveJob(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        job.status = "failed";
        job.error = message;
        job.history.push({ node: node.name, status: "failed", at: new Date().toISOString(), message });
        saveJob(job);
        return job;
      }
    }
    job.currentNode = null;
    job.status = "completed";
    saveJob(job);
    return job;
  }
}
