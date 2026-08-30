import type { ContentPackage } from "../content/index.js";
import type { CreativeStrategy } from "../runtime/stage-artifacts.js";

export function buildCreativeStrategy(content: ContentPackage): CreativeStrategy {
  const hook = content.hook.trim();
  const body = content.body.trim();
  const cta = content.callToAction.trim();
  const url = content.productUrl.trim();
  if (!hook || !body || !cta || !url) {
    throw new Error("creative strategy requires hook, body, call to action, and product URL");
  }

  const storyboard = [
    `Scene 1 — STOP SCROLL: ${hook}. Show the actual product immediately, vertical 9:16, clean commercial framing.`,
    `Scene 2 — VALUE: Show the product in realistic use. Communicate the main buyer benefit from: ${body}.`,
    `Scene 3 — DETAIL: Close-up of the product, material/design/features visible. No invented features.`,
    `Scene 4 — DEAL & PROOF: Present only verified price, promotion, rating, reviews, and sales evidence from the content.`,
    `Scene 5 — CTA: ${cta}. End with a clear visual instruction to tap the product link.`,
  ];

  return {
    image: [
      `Vertical 9:16 product hero. Feature the exact product named in: ${content.title}. Hook: ${hook}. Premium ecommerce advertising photography, realistic product proportions, no unrelated objects.`,
      `Vertical 9:16 product-in-use scene for ${content.title}. Demonstrate the buyer benefit described in the copy without inventing specifications.`,
    ],
    video: [storyboard.join("\n")],
    storyboard,
    prompt: [
      `Create a high-converting vertical 9:16 ecommerce ad for ${content.title}. Use this exact hook: ${hook}. Show the real product clearly. Do not invent claims, logos, prices, discounts, reviews, or features.`,
      `Create a vertical 9:16 product sales video for ${content.title}. Follow this storyboard exactly:\n${storyboard.join("\n")}`,
    ],
  };
}

export function validateCreativeStrategy(strategy: CreativeStrategy): string[] {
  const errors: string[] = [];
  if (strategy.image.length < 2) errors.push("creative needs hero and product-in-use image concepts");
  if (strategy.video.length < 1) errors.push("missing video concept");
  if (strategy.storyboard.length < 5) errors.push("storyboard must contain at least 5 sales beats");
  if (strategy.prompt.length < 2) errors.push("creative strategy needs image and video prompts");
  if (strategy.storyboard.some((beat) => !beat.trim())) errors.push("storyboard contains empty beat");
  return errors;
}
