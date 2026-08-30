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
  const voiceScript = (content.voiceScript?.length ? content.voiceScript : [hook, body, "ดูตัวสินค้าและรายละเอียดที่สำคัญ", "เช็กราคาและโปรล่าสุดก่อนซื้อ", cta]).map(clean);
  const subtitleScript = (content.subtitleScript?.length ? content.subtitleScript : [hook, "จุดเด่นน่าสนใจ", "ดูรายละเอียดสินค้า", "เช็กราคาและโปร", cta]).map(clean);
  if (!title || !hook || !body || !cta || !url) throw new Error("creative strategy requires product title, hook, body, call to action, and product URL");
  if (INTERNAL_TERMS.test(content.title) || INTERNAL_TERMS.test(content.hook) || INTERNAL_TERMS.test(content.body) || INTERNAL_TERMS.test(content.callToAction)) throw new Error("creative strategy contains internal analysis text");

  const storyboard = [
    `Scene 1 — HOOK: Open immediately on ${title}. Product is clearly visible in a clean vertical 9:16 commercial shot. On-screen text: ${subtitleScript[0]}.`,
    `Scene 2 — NEED/BENEFIT: Show ${title} in a realistic everyday use case. Show only the supported benefits from this copy: ${body}. On-screen text: ${subtitleScript[1]}.`,
    `Scene 3 — PRODUCT DEMO: Show ${title} from close, medium, and detail angles. Demonstrate only visible or explicitly supported features; never invent specifications. On-screen text: ${subtitleScript[2]}.`,
    `Scene 4 — VALUE/PROOF: Show ${title} with the verified price/promotion and any supplied proof only. On-screen text: ${subtitleScript[3]}. Never fabricate ratings, reviews, or sales.`,
    `Scene 5 — CTA: End with a clean hero shot of ${title}. On-screen text: ${subtitleScript[4]}. Do not display or narrate the URL; the purchase link is supplied separately in the first comment.`,
  ];

  return {
    image: [
      `Vertical 9:16 ecommerce hero image featuring exactly ${title}. Clean commercial lighting, realistic proportions, no unrelated products, no invented features or claims.`,
      `Vertical 9:16 lifestyle product image featuring exactly ${title}. Show a realistic use case using only the supported product information from the content.`,
    ],
    video: [
      `Create a vertical 9:16 ecommerce product video featuring exactly ${title}. Follow these five scenes exactly:\n${storyboard.join("\n")}`,
    ],
    storyboard,
    prompt: [
      `Create a high-converting vertical 9:16 ecommerce ad for exactly ${title}. Hook: ${hook}. Use only supplied product facts. Do not substitute another product or invent claims, logos, prices, discounts, reviews, or features.`,
      `Create a vertical 9:16 product sales video for exactly ${title}. Use the following storyboard and keep the product identity consistent:\n${storyboard.join("\n")}`,
    ],
    voiceScript,
    subtitleScript,
  };
}

export function validateCreativeStrategy(strategy: CreativeStrategy): string[] {
  const errors: string[] = [];
  if (strategy.image.length < 2) errors.push("creative needs hero and product-in-use image concepts");
  if (strategy.video.length < 1) errors.push("missing video concept");
  if (strategy.storyboard.length !== 5) errors.push("storyboard must contain exactly 5 sales scenes");
  if (strategy.prompt.length < 2) errors.push("creative strategy needs image and video prompts");
  if (strategy.storyboard.some((beat) => !beat.trim())) errors.push("storyboard contains empty beat");
  if (strategy.voiceScript && strategy.voiceScript.length !== 5) errors.push("voice script must contain exactly 5 lines");
  if (strategy.subtitleScript && strategy.subtitleScript.length !== 5) errors.push("subtitle script must contain exactly 5 lines");
  if ([...strategy.image, ...strategy.video, ...strategy.storyboard, ...strategy.prompt, ...(strategy.voiceScript ?? []), ...(strategy.subtitleScript ?? [])].some((item) => INTERNAL_TERMS.test(item))) errors.push("creative strategy contains internal analysis text");
  return errors;
}
