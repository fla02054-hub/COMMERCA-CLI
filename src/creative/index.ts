import type { ContentPackage } from "../content/index.js";
import type { CreativeStrategy } from "../runtime/stage-artifacts.js";

export function buildCreativeStrategy(content: ContentPackage): CreativeStrategy {
  const hook = content.hook.trim();
  const body = content.body.trim();
  const cta = content.callToAction.trim();
  return {
    image: [`9:16 product hero: ${hook}`],
    video: [`9:16 product demonstration built around: ${hook}`],
    storyboard: [
      `Hook: ${hook}`,
      `Problem/benefit: ${body}`,
      "Product demonstration",
      "Proof / key product evidence",
      `CTA: ${cta}`,
    ],
    prompt: [`Create a vertical 9:16 commercial creative using this content: ${JSON.stringify(content)}`],
  };
}
