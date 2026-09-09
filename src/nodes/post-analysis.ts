import type { FlowNode, NodeContext, NodePayload, PostAnalysisData, PostData } from "../core/types.js";

export class PostAnalysisNode implements FlowNode {
  readonly name = "POST ANALYSIS" as const;
  readonly inputPorts = [{ name: "post" }] as const;
  readonly outputPorts = [{ name: "analysis" }] as const;

  async execute({ job, input }: NodeContext): Promise<NodePayload> {
    const post = input.post as PostData | undefined;
    if (!post) throw new Error("POST ANALYSIS requires POST output.");
    const metrics = job.postAnalysis ?? { views: 0, likes: 0, comments: 0, shares: 0, clicks: 0, orders: 0, ctr: 0, engagementRate: 0, score: 0, nextAction: "collect real post metrics" };
    const interactions = metrics.likes + metrics.comments + metrics.shares;
    const ctr = metrics.views > 0 ? metrics.clicks / metrics.views * 100 : 0;
    const engagementRate = metrics.views > 0 ? interactions / metrics.views * 100 : 0;
    const score = Math.round((Math.min(ctr, 10) / 10 * 40 + Math.min(engagementRate, 20) / 20 * 30 + Math.min(metrics.orders, 10) / 10 * 30) * 100) / 100;
    const nextAction = metrics.views === 0 ? "collect real post metrics" : score >= 70 ? "keep strategy and test a new variation" : score >= 40 ? "improve hook and offer" : "rework content angle";
    const analysis: PostAnalysisData = { ...metrics, ctr: Math.round(ctr * 100) / 100, engagementRate: Math.round(engagementRate * 100) / 100, score, nextAction };
    job.postAnalysis = analysis;
    return { analysis };
  }
}
