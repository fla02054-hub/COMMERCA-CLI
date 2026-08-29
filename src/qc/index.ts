import type { Product } from "../product/types.js";
import type { ContentPackage } from "../content/index.js";

export interface QCResult {
  passed: boolean;
  score: number;
  errors: string[];
  warnings: string[];
}

export function runContentQC(product: Product, content: ContentPackage): QCResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!product.name.trim()) errors.push("product name is missing");
  if (!product.url) errors.push("product URL is missing");
  if (!content.title.trim()) errors.push("content title is missing");
  if (!content.hook.trim()) errors.push("content hook is missing");
  if (!content.body.trim()) errors.push("content body is missing");
  if (!content.callToAction.trim()) errors.push("CTA is missing");
  if (!content.productUrl) warnings.push("content has no product URL");
  if (product.price === undefined) warnings.push("product price is unavailable");
  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);
  return { passed: errors.length === 0, score, errors, warnings };
}
