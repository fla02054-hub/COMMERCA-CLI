import type { Product } from "../product/types.js";
import type { ContentPackage } from "../content/index.js";

export interface QCResult { passed: boolean; score: number; errors: string[]; warnings: string[]; }

export function runContentQC(product: Product, content: ContentPackage): QCResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!product.name.trim()) errors.push("product name is missing");
  if (!product.url) errors.push("product URL is missing");
  if (!content.title.trim() || content.title.length > 70) errors.push("content title is missing or too long");
  if (!content.hook.trim() || content.hook.length > 180) errors.push("content hook is missing or too long");
  if (!content.body.trim() || content.body.length > 900) errors.push("content body is missing or too long");
  if (!content.callToAction.trim()) errors.push("CTA is missing");
  if (!content.productUrl) errors.push("content product URL is missing");
  if (product.url && content.productUrl !== product.url) errors.push("content product URL does not match product URL");
  if (product.url && content.caption.includes(product.url)) errors.push("caption must not contain product URL");
  if (!content.firstComment || product.url && !content.firstComment.includes(product.url)) errors.push("first comment must contain the selected product URL");
  if (!content.hashtags.length || content.hashtags.length > 5) errors.push("hashtags must contain 1-5 tags");
  if (content.hashtags.some((tag) => !/^#[^\s#]{2,40}$/.test(tag))) errors.push("hashtag format is invalid");
  if (!content.voiceScript || content.voiceScript.length !== 5) errors.push("voice script must contain exactly 5 lines");
  if (!content.subtitleScript || content.subtitleScript.length !== 5) errors.push("subtitle script must contain exactly 5 lines");
  if (product.price === undefined) warnings.push("product price is unavailable");
  const score = Math.max(0, 100 - errors.length * 12 - warnings.length * 3);
  return { passed: errors.length === 0, score, errors, warnings };
}
