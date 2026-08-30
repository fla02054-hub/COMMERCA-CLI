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

function categoryHashtag(name: string): string {
  const lower = name.toLowerCase();
  if (/(รองเท้า|วิ่ง|sneaker|running)/i.test(lower)) return "#รองเท้าวิ่ง";
  if (/(แบต|power.?bank|ชาร์จ|charger)/i.test(lower)) return "#PowerBank";
  if (/(โลชั่น|ครีม|ผิว|skincare|body)/i.test(lower)) return "#ดูแลผิว";
  if (/(บ้าน|ครัว|เครื่องใช้|home)/i.test(lower)) return "#ของใช้ในบ้าน";
  return "#ช้อปปิ้งออนไลน์";
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
  const angles = ["ปัญหา/ความต้องการของคนซื้อ", "จุดเด่นและประโยชน์ของสินค้า", "ราคา โปร และหลักฐานความนิยม"];
  const hooks = [
    `🔥 ${product.name} เหลือ ${price} จาก ${original} — ${discount}`,
    `👀 กำลังมองหา ${product.name}? เช็กจุดเด่นและโปรก่อนซื้อ`,
    `💥 ดีล ${product.name} ที่ควรเปิดดูตอนนี้ — ${price}${product.promotion ? ` • ${product.promotion}` : ""}`,
  ];
  const copyBrief = `เขียนโพสต์สไตล์ Social Commerce: เปิดด้วยปัญหาหรือ Hook ที่หยุดการเลื่อน → ระบุชื่อสินค้า → แจกแจงจุดเด่นที่มีหลักฐานจากข้อมูลสินค้าเท่านั้น → ราคา/ราคาเดิม/ส่วนลด/โปร → CTA → Product URL. ห้ามแต่งสรรพคุณหรือข้อมูลที่ไม่มีหลักฐาน.`;
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
  const original = product.originalPrice !== undefined ? money(product.originalPrice) : undefined;
  const promotion = product.promotion?.trim();
  const discount = product.discount !== undefined ? `ลด ${money(product.discount)}` : undefined;
  const proof: string[] = [];
  if (product.rating !== undefined) proof.push(`⭐ คะแนน ${product.rating}/5`);
  if (product.reviewCount !== undefined) proof.push(`รีวิว ${product.reviewCount.toLocaleString("th-TH")}`);
  if (product.salesCount !== undefined) proof.push(`ขายแล้ว ${product.salesCount.toLocaleString("th-TH")} ชิ้น`);
  const evidence = proof.join(" • ");

  // Social-commerce format: problem/benefit -> product -> verified features -> deal -> link -> CTA -> hashtags.
  const hook = discount && original
    ? `🔥 ${product.name} ราคานี้น่าสนใจ! จาก ${original} เหลือ ${price} | ${discount}`
    : `⚡ กำลังมองหา ${product.name}? เช็กดีลนี้ก่อนตัดสินใจ`;
  const featureLines = [
    `🛍️ ${product.name}`,
    evidence ? `🌟 ${evidence}` : undefined,
    promotion ? `🎁 โปรโมชัน: ${promotion}` : undefined,
  ].filter(Boolean) as string[];
  const priceLine = original && discount
    ? `💰 ราคาปกติ ${original} เหลือเพียง ${price} ${discount}`
    : `💰 ราคา ${price}`;
  const callToAction = "👉 คลิกดูรายละเอียดสินค้าและเช็กราคา/โค้ดส่วนลดล่าสุดได้เลย";
  const hashtags = [productHashtag(product.name), categoryHashtag(product.name), "#Shopee", "#ShopeeSale", "#โปรเด็ด"];
  const body = [
    ...featureLines,
    priceLine,
    `🛒 พิกัดซื้อ: ${productUrl}`,
    callToAction,
    hashtags.join(" "),
  ].join("\n\n");

  return {
    title: product.name,
    hook,
    body,
    caption: `${hook}\n\n${body}`,
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
