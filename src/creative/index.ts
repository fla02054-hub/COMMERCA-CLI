import type { ContentPackage } from "../content/index.js";
import type { CreativeStrategy } from "../runtime/stage-artifacts.js";

const INTERNAL_TERMS = /(good content potential|content potential|analysis|reasoning|score|internal)/i;

function clean(value: string): string {
  return value.replace(INTERNAL_TERMS, "").replace(/\s{2,}/g, " ").trim();
}

export function buildCreativeStrategy(content: ContentPackage): CreativeStrategy {
  const title = clean(content.title);
  const hook = clean(content.hook);
  const body = clean(content.body);
  const cta = clean(content.callToAction);
  const url = content.productUrl.trim();
  if (!title || !hook || !body || !cta || !url) {
    throw new Error("creative strategy requires product title, hook, body, call to action, and product URL");
  }
  if (INTERNAL_TERMS.test(content.title) || INTERNAL_TERMS.test(content.hook) || INTERNAL_TERMS.test(content.body) || INTERNAL_TERMS.test(content.callToAction)) {
    throw new Error("creative strategy contains internal analysis text");
  }

  const storyboard = [
    `Scene 1 — HOOK: Show ${title} immediately in a clean vertical 9:16 commercial shot. On-screen message: ${hook}.`,
    `Scene 2 — NEED/BENEFIT: Show ${title} being used in a realistic everyday situation. Communicate only benefits supported by the product copy: ${body}.`,
    `Scene 3 — PRODUCT DEMO: Show ${title} from multiple useful angles and demonstrate only visible or explicitly supported functions/features. Do not invent specifications.`,
    `Scene 4 — VALUE/PROOF: Show ${title} clearly with only verified price, promotion, rating, review, or sales evidence present in the content. Never fabricate proof.`,
    `Scene 5 — CTA: End on ${title} with a clean product hero shot and the message: ${cta}. Do not display or narrate the URL; the purchase link is supplied separately in the first comment.`,
  ];

  return {
    image: [
      `Vertical 9:16 ecommerce hero image featuring exactly ${title}. ${hook}. Realistic product proportions, clean commercial lighting, no unrelated products, no invented features or claims.`,
      `Vertical 9:16 lifestyle product image featuring exactly ${title}. Show a realistic use case based only on the supplied product information: ${body}.`,
    ],
    video: [
      `Create a vertical 9:16 ecommerce product video featuring exactly ${title}. Follow these five scenes exactly:\n${storyboard.join("\n")}`,
    ],
    storyboard,
    prompt: [
      `Create a high-converting vertical 9:16 ecommerce ad for exactly ${title}. Use this hook: ${hook}. Product identity must remain ${title}. Do not substitute another product. Use only supplied facts; never invent claims, logos, prices, discounts, reviews, or features.`,
      `Create a vertical 9:16 product sales video for exactly ${title}. Product identity must remain ${title}. Follow this storyboard exactly:\n${storyboard.join("\n")}`,
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
  if ([...strategy.image, ...strategy.video, ...strategy.storyboard, ...strategy.prompt].some((item) => INTERNAL_TERMS.test(item))) errors.push("creative strategy contains internal analysis text");
  return errors;
}
