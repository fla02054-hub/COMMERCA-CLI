import type { FlowNode, NodeContext, NodePayload, PostData, ProductionData } from "../core/types.js";

export class PostNode implements FlowNode {
  readonly name = "POST" as const;
  readonly inputPorts = [{ name: "production" }] as const;
  readonly outputPorts = [{ name: "post" }] as const;

  async execute({ job, input }: NodeContext): Promise<NodePayload> {
    const production = input.production as ProductionData | undefined;
    if (!job.content || !production) throw new Error("POST requires CONTENT context and PRODUCTION output.");

    // When a real publisher is added later, this key must be passed to it so a retry cannot create a duplicate post.
    const idempotencyKey = `${job.id}:POST`;
    if (job.post?.status === "posted" && job.post.idempotencyKey === idempotencyKey) {
      return { post: job.post };
    }

    const post: PostData = {
      platform: "facebook",
      status: "ready",
      idempotencyKey
    };
    job.post = post;
    return { post };
  }
}
