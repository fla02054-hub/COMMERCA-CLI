import type { FlowNode, NodeContext, NodePayload, PostData, ProductionData } from "../core/types.js";

export class PostNode implements FlowNode {
  readonly name = "POST" as const;
  readonly inputPorts = [{ name: "production" }] as const;
  readonly outputPorts = [{ name: "post" }] as const;

  async execute({ job, input }: NodeContext): Promise<NodePayload> {
    const production = input.production as ProductionData | undefined;
    if (!job.content || !production) throw new Error("POST requires CONTENT context and PRODUCTION output.");
    const post: PostData = { platform: "facebook", status: "ready" };
    job.post = post;
    return { post };
  }
}
