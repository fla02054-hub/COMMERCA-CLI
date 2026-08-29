import type { ContentPackage } from "../content/index.js";
import type { CreativeStrategy } from "../runtime/stage-artifacts.js";

export function buildCreativeStrategy(content: ContentPackage): CreativeStrategy {
  const hook = content.hook.trim();
  const body = content.body.trim();
  const cta = content.callToAction.trim();
  if (!hook || !body || !cta) {
    throw new Error("creative strategy requires hook, body, and call to action");
  }

  return {
    image: [
      `9:16 product hero: ${hook}`,
      `9:16 product detail: ${body}`,
    ],
    video: [
      `9:16 product demonstration built around: ${hook}`,
      `9:16 benefit-focused demonstration: ${body}`,
    ],
    storyboard: [
      `Hook: ${hook}`,
      `Problem/benefit: ${body}`,
      "Product demonstration",
      "Proof / key product evidence",
      `CTA: ${cta}`,
    ],
    prompt: [
      `Create a vertical 9:16 commercial image using this content: ${JSON.stringify(content)}`,
      `Create a vertical 9:16 product video using this content: ${JSON.stringify(content)}`,
    ],
  };
}

export function validateCreativeStrategy(strategy: CreativeStrategy): string[] {
  const errors: string[] = [];
  if (strategy.image.length < 1) errors.push("missing image concept");
  if (strategy.video.length < 1) errors.push("missing video concept");
  if (strategy.storyboard.length < 5) errors.push("storyboard must contain at least 5 beats");
  if (strategy.prompt.length < 2) errors.push("creative strategy needs image and video prompts");
  if (strategy.storyboard.some((beat) => !beat.trim())) errors.push("storyboard contains empty beat");
  return errors;
}
