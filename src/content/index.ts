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
  if (!url?.trim()) throw new Error("Product URL is required for publish-ready content.");
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error();
  } catch {
    throw new Error("Product URL must be a valid http(s) URL.");
  }
  return url.trim();
}

function money(value: number | undefined): string {
  return value === undefined ? "เช็กราคาล่าสุด" : `฿${value.toLocaleString("th-TH")}`;
}

function productHashtag(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 40);
  return clean ? `#${clean}` : "#โปรเด็ด";
}

export function buildContentStrategy(analysis: ProductAnalysis): ContentStrategy {
  const { product } = analysis;
  const productUrl = validateUrl(product.url);
  const price = money(product.price);
  const original = money(product.originalPrice);
  const discount = product.discount !== undefined ? `ลด ${money(product.discount)}` : "มีโปรให้เช็ก";
  const proof: string[] = [];
  if (product.rating !== undefined) proof.push(`คะแนน ${product.rating}/5`);
  if (product.reviewCount !== undefined) proof.push(`${product.reviewCount.toLocaleString("th-TH")} รีวิว`);
  if (product.salesCount !== undefined) proof.push(`${product.salesCount.toLocaleString("th-TH")} ชิ้นขาย`);
  const evidence = proof.join(" • ") || "ตรวจสอบรายละเอียดในหน้าสินค้า";
  const angles = ["ประโยชน์ที่คนซื้อจะได้", "ราคาและส่วนลดเทียบราคาเดิม", "หลักฐานความนิยมและโปรโมชัน"];
  const hooks = [
    `🔥 ${product.name} เหลือ ${price} จาก ${original} — ${discount}`,
    `👀 ก่อนซื้อ ${product.name} เช็ก 3 จุดนี้: ${evidence}`,
    `💥 ดีล ${product.name} ที่ควรเปิดดูตอนนี้ — ราคา ${price}${product.commission !== undefined ? ` • คอมมิชชัน ฿${product.commission}` : ""}`,
  ];
  const copyBrief = `ขาย ${product.name} ด้วยข้อมูลที่ตรวจสอบได้: ราคา ${price}, ราคาเดิม ${original}, ${discount}, ${evidence}. ห้ามแต่งสรรพคุณหรือโปรที่ไม่มีในข้อมูล.`;
  const callToAction = "👉 กดลิงก์ด้านล่างเพื่อดูสินค้า เช็กราคา และโปรล่าสุดก่อนหมดโปร";
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
  const price = money(product.price);
  const original = money(product.originalPrice);
  const promotion = product.promotion?.trim();
  const discount = product.discount !== undefined ? `ลด ${money(product.discount)}` : undefined;
  const proof: string[] = [];
  if (product.rating !== undefined) proof.push(`⭐ ${product.rating}/5`);
  if (product.reviewCount !== undefined) proof.push(`รีวิว ${product.reviewCount.toLocaleString("th-TH")}`);
  if (product.salesCount !== undefined) proof.push(`ขายแล้ว ${product.salesCount.toLocaleString("th-TH")}`);
  const evidence = proof.join(" • ");
  const hook = discount
    ? `🔥 ${product.name} เหลือ ${price} จาก ${original} | ${discount}`
    : `🔥 ${product.name} ราคา ${price} — เช็กดีลก่อนตัดสินใจ`;
  const details = [
    `💰 ราคา: ${price}${product.originalPrice !== undefined ? ` (จาก ${original})` : ""}`,
    discount,
    promotion ? `🎁 โปร: ${promotion}` : undefined,
    evidence || undefined,
  ].filter(Boolean).join("\n");
  const body = `${details}\n\nเหมาะสำหรับคนที่กำลังมองหา ${product.name} และอยากเทียบราคา/โปรก่อนซื้อ`;
  const callToAction = "👉 กดลิงก์เพื่อดูรายละเอียดสินค้า เช็กราคา และโปรโมชันล่าสุดก่อนตัดสินใจ";
  const hashtags = [productHashtag(product.name), "#Shopee", "#โปรShopee", "#ช้อปปิ้งออนไลน์", "#ของดีบอกต่อ"];
  return {
    title: product.name,
    hook,
    body,
    caption: `${hook}\n\n${body}\n\n${callToAction}\n🔗 ${productUrl}\n\n${hashtags.join(" ")}`,
    callToAction,
    hashtags,
    productUrl,
  };
}

export function validateProductForContent(product: Product): string[] {
  const errors: string[] = [];
  if (!product.name?.trim()) errors.push("missing product name");
  try { validateUrl(product.url); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return errors;
}
