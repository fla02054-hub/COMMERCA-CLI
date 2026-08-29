import type { Product } from "../product/types.js";
import type { ProductAnalysis } from "../product/analysis.js";

export interface ContentStrategy {
  angles: string[];
  hooks: string[];
  copyBrief: string;
  callToAction: string;
  productUrl?: string;
}

export interface ContentPackage {
  title: string;
  hook: string;
  body: string;
  callToAction: string;
  productUrl?: string;
}

export function buildContentStrategy(analysis: ProductAnalysis): ContentStrategy {
  const { product } = analysis;
  const price = product.price !== undefined ? `฿${product.price.toLocaleString()}` : "ราคาพิเศษ";
  const promotion = product.promotion?.trim();
  const reasons = analysis.reasons.filter(Boolean);
  const proof = reasons.length > 0 ? reasons.join(", ") : "ข้อมูลสินค้า";

  const angles = [
    "คุ้มค่าและราคา",
    "โปรโมชั่นและความเร่งด่วน",
    "ประโยชน์ใช้งานจริง",
  ];
  const hooks = [
    `🔥 ${product.name} — ${price}`,
    promotion ? `🔥 ${product.name} ${promotion}` : `🔥 ดีลน่าสนใจ: ${product.name}`,
    `✨ ทำไม ${product.name} ถึงน่าสนใจ?`,
  ];
  const copyBrief = `นำเสนอ ${product.name} โดยเน้น ${proof}${promotion ? ` และ ${promotion}` : ""} พร้อมราคา ${price}; หลีกเลี่ยงการอ้างสรรพคุณที่ไม่มีหลักฐาน`;
  const callToAction = "ดูรายละเอียดและเช็กราคาที่หน้าสินค้า";

  return {
    angles,
    hooks,
    copyBrief,
    callToAction,
    ...(product.url ? { productUrl: product.url } : {}),
  };
}

export function validateContentStrategy(strategy: ContentStrategy): string[] {
  const errors: string[] = [];
  if (strategy.angles.length < 3) errors.push("content strategy needs at least 3 angles");
  if (strategy.hooks.length < 3) errors.push("content strategy needs at least 3 hooks");
  if (!strategy.copyBrief.trim()) errors.push("missing copy brief");
  if (!strategy.callToAction.trim()) errors.push("missing call to action");
  return errors;
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
