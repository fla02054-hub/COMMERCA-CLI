import type { FlowNode, NodeContext } from "../core/types.js";

export class PostNode implements FlowNode {
  readonly name = "POST" as const;
  async execute({ job }: NodeContext): Promise<void> {
    if (!job.content || !job.production) throw new Error("POST requires CONTENT and PRODUCTION outputs.");
    job.post = { platform: "facebook", status: "ready" };
  }
}
