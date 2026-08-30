import type { Product } from "../product/types.js";
import type { ProductAnalysis } from "../product/analysis.js";

export interface ContentStrategy {
  angles: string[];
  hooks: string[];
  copyBrief: string;
  callToAction: string;
  productUrl: string;
}

export interface ContentPackage {
  title: string;
  hook: string;
  body: string;
  caption: string;
  callToAction: string;
  hashtags: string[];
  productUrl: string;
}

function validateUrl(url: string | undefined): string {
  if (!url) throw new Error("Product URL is required for publish-ready content.");
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("Product URL must be a valid http(s) URL.");
  }
  return url;
}

export function buildContentStrategy(analysis: ProductAnalysis): ContentStrategy {
  const { product } = analysis;
  const productUrl = validateUrl(product.url);
  const price = product.price !== undefined ? `฿${product.price.toLocaleString()}` : "ราคาพิเศษ";
  const promotion = product.promotion?.trim();
  const reasons = analysis.reasons.filter(Boolean);
  const proof = reasons.length > 0 ? reasons.join(", ") : "จุดเด่นจากข้อมูลสินค้า";
  const angles = ["จุดเด่นและประโยชน์ใช้งานจริง", "ราคาและความคุ้มค่า", "โปรโมชั่นและความเร่งด่วน"];
  const hooks = [
    `🔥 ${product.name} ราคา ${price} — จุดเด่นที่ทำให้น่าซื้อ`,
    promotion ? `🔥 ${product.name} + ${promotion} — รีบเช็กโปรก่อนหมด` : `🔥 ${product.name} ${price} — ดีลที่ควรเช็กตอนนี้`,
    `👀 ถ้ากำลังหา ${product.name} ดู 3 จุดนี้ก่อนตัดสินใจ`,
  ];
  const copyBrief = `ขาย ${product.name} โดยเน้น ${proof}${promotion ? ` และโปร ${promotion}` : ""}; ใช้ราคา ${price}; ห้ามอ้างสรรพคุณเกินข้อมูลจริง`;
  const callToAction = "👉 กดลิงก์เพื่อดูรายละเอียด เช็กราคา และโปรโมชันล่าสุด";
  return { angles, hooks, copyBrief, callToAction, productUrl };
}

export function validateContentStrategy(strategy: ContentStrategy): string[] {
  const errors: string[] = [];
  if (strategy.angles.length < 3) errors.push("content strategy needs at least 3 angles");
  if (strategy.hooks.length < 3) errors.push("content strategy needs at least 3 hooks");
  if (!strategy.copyBrief.trim()) errors.push("missing copy brief");
  if (!strategy.callToAction.trim()) errors.push("missing call to action");
  try { validateUrl(strategy.productUrl); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return errors;
}

export function generateContent(analysis: ProductAnalysis): ContentPackage {
  const { product } = analysis;
  const productUrl = validateUrl(product.url);
  const price = product.price !== undefined ? `฿${product.price.toLocaleString()}` : "ราคาพิเศษ";
  const promotion = product.promotion?.trim();
  const reasons = analysis.reasons.filter(Boolean);
  const sellingPoints = reasons.length ? reasons.slice(0, 3).join(" • ") : "ดูรายละเอียดสินค้าและโปรโมชันล่าสุด";
  const hook = promotion
    ? `🔥 ${product.name} ราคา ${price} | ${promotion}`
    : `🔥 ${product.name} ราคา ${price} — เช็กดีลก่อนตัดสินใจ`;
  const body = `กำลังมองหา ${product.name} อยู่ไหม? จุดที่น่าสนใจ: ${sellingPoints}${promotion ? ` | โปรตอนนี้: ${promotion}` : ""}.`;
  const callToAction = "👉 กดลิงก์เพื่อดูรายละเอียด เช็กราคา และโปรโมชันล่าสุด";
  const productTag = product.name.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 40);
  const hashtags = ["#Shopee", "#โปรShopee", productTag ? `#${productTag}` : "#โปรเด็ด", "#ของดีบอกต่อ", "#ช้อปปิ้งออนไลน์"];
  return {
    title: product.name,
    hook,
    body,
    caption: `${hook}\n\n${body}\n\n${callToAction}\n${productUrl}\n\n${hashtags.join(" ")}`,
    callToAction,
    hashtags,
    productUrl,
  };
}

export function validateProductForContent(product: Product): string[] {
  const errors: string[] = [];
  if (!product.name.trim()) errors.push("missing product name");
  try { validateUrl(product.url); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return errors;
}
