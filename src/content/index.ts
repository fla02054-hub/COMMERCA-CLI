import type { Product } from "../product/types.js";
import type { ProductAnalysis } from "../product/analysis.js";

export interface ContentPackage {
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  productUrl?: string;
}

export function generateContent(analysis: ProductAnalysis): ContentPackage {
  const { product } = analysis;
  const price = product.price !== undefined ? `฿${product.price.toLocaleString()}` : "ราคาพิเศษ";
  const promotion = product.promotion ? ` ${product.promotion}` : "";
  return {
    title: product.name,
    hook: `🔥 ${product.name} — ${price}`,
    body: `สินค้าเด่นที่น่าสนใจในตอนนี้${promotion} ${analysis.reasons.join(", ")}.`,
    callToAction: "ดูรายละเอียดและเช็กราคาที่หน้าสินค้า",
    ...(product.url ? { productUrl: product.url } : {}),
  };
}

export function validateProductForContent(product: Product): string[] {
  const errors: string[] = [];
  if (!product.name.trim()) errors.push("missing product name");
  if (!product.url) errors.push("missing product URL");
  return errors;
}
