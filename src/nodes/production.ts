import type { ContentData, FlowNode, NodeContext, NodePayload, ProductData, ProductionData } from "../core/types.js";

export class ProductionNode implements FlowNode {
  readonly name = "PRODUCTION" as const;
  readonly inputPorts = [{ name: "content" }] as const;
  readonly outputPorts = [{ name: "production" }] as const;

  async execute({ job, input }: NodeContext): Promise<NodePayload> {
    const p = job.product;
    const c = input.content as ContentData | undefined;
    if (!p || !c) throw new Error("PRODUCTION requires PRODUCT context and CONTENT output.");
    const subject = p.name;
    const imagePrompt = `Vertical 9:16 commercial product image. Show ${subject} as the clear hero subject, realistic lighting, useful context, product details visible, clean composition, no invented brand claims, no unrelated objects.`;
    const scenes = [
      `Scene 1: immediately show ${subject} clearly in use.`,
      `Scene 2: demonstrate the main problem it addresses.`,
      `Scene 3: show the most important product detail.`,
      `Scene 4: show the practical benefit in a realistic situation.`,
      `Scene 5: return to the product with the key offer and purchase action.`
    ];
    const videoPrompt = `${c.hook}. ${scenes.join(" ")} Keep the product identifiable and central throughout.`;
    const production: ProductionData = { imagePrompt, videoPrompt, scenes };
    job.production = production;
    return { production };
  }
}
