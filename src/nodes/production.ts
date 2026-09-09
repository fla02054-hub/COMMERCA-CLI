import type { FlowNode, NodeContext } from "../core/types.js";

export class ProductionNode implements FlowNode {
  readonly name = "PRODUCTION" as const;
  async execute({ job }: NodeContext): Promise<void> {
    const p = job.product;
    const c = job.content;
    if (!p || !c) throw new Error("PRODUCTION requires PRODUCT and CONTENT outputs.");
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
    job.production = { imagePrompt, videoPrompt, scenes };
  }
}
