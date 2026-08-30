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
  firstComment: string;
  voiceScript: string[];
  subtitleScript: string[];
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
  return value === undefined ? "เช็กราคาล่าสุด" : `${value.toLocaleString("th-TH")}. -`;
}

function productHashtag(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 40);
  return clean ? `#${clean}` : "#โปรเด็ด";
}

function categoryHashtag(name: string): string {
  const lower = name.toLowerCase();
  if (/(รองเท้า|วิ่ง|sneaker|running)/i.test(lower)) return "#รองเท้าวิ่ง";
  if (/(จักรยาน|electric.?bike|ebike|bike)/i.test(lower)) return "#จักรยานไฟฟ้า";
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
    `🔥 ${product.name} ราคานี้น่าสนใจ! จาก ${original} เหลือ ${price}`,
    `👀 กำลังมองหา ${product.name}? เช็กดีลนี้ก่อน`,
    `💥 ${product.name} มีโปรอยู่ตอนนี้ — ${price}`,
  ];
  const copyBrief = "เขียนโพสต์ Social Commerce ภาษาไทยแบบอ่านเร็ว: Hook จากปัญหาหรือความต้องการ → ชื่อสินค้า → จุดเด่น/หลักฐานจาก Product data เท่านั้น → ราคา/โปร → CTA ให้กดลิงก์ในคอมเมนต์แรก → Hashtags. ห้ามใส่ URL ใน Caption และห้ามแต่งข้อมูลสินค้า. ห้ามเปิดเผยข้อความหรือการวิเคราะห์ภายในระบบ เช่น good content potential, content potential, analysis, score หรือ reasoning.";
  const callToAction = "👇 สนใจสินค้า กดลิงก์ในคอมเมนต์แรก";
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

  const hook = product.originalPrice !== undefined && product.price !== undefined
    ? `🔥 ${product.name} ราคานี้น่าสนใจ!`
    : `🔥 ${product.name} ใครกำลังมองหาอยู่ ลองดูตัวนี้ก่อน!`;

  const evidence: string[] = [];
  if (product.rating !== undefined) evidence.push(`⭐ คะแนน ${product.rating}/5`);
  if (product.reviewCount !== undefined) evidence.push(`รีวิว ${product.reviewCount.toLocaleString("th-TH")} รีวิว`);
  if (product.salesCount !== undefined) evidence.push(`ขายแล้ว ${product.salesCount.toLocaleString("th-TH")} ชิ้น`);

  const featureLines = [
    `🛍️ ${product.name}`,
    evidence.length ? `✨ ${evidence.join(" • ")}` : undefined,
    promotion ? `🎁 ${promotion}` : undefined,
  ].filter(Boolean) as string[];

  const priceLine = original && discount
    ? `💥 จาก ${original} เหลือเพียง ${price} | ${discount}`
    : `💰 ราคา ${price}`;
  const callToAction = "👇 สนใจสินค้า กดลิงก์ในคอมเมนต์แรก";
  const hashtags = [productHashtag(product.name), categoryHashtag(product.name), "#Shopee", "#ShopeeSale", "#โปรเด็ด"];
  const body = [
    `กำลังมองหา ${product.name} อยู่? ลองเช็กข้อมูลและโปรล่าสุดก่อนตัดสินใจ 👀`,
    ...featureLines,
    priceLine,
    callToAction,
    hashtags.join(" "),
  ].join("\n\n");

  const caption = `${hook}\n\n${body}`;
  const firstComment = `🛒 พิกัดสินค้า 👇\n🔗 ${productUrl}`;

  const voiceScript = [
    `🔥 ${product.name} ราคานี้น่าสนใจ!`,
    `กำลังมองหา ${product.name} อยู่? ลองเช็กข้อมูลและโปรล่าสุดก่อนตัดสินใจ`,
    `จุดเด่นและรายละเอียดของ ${product.name} ดูได้จากข้อมูลสินค้าที่ระบุไว้`,
    original && discount ? `จาก ${original} เหลือเพียง ${price} ${discount}` : `ตอนนี้ราคา ${price}`,
    "สนใจสินค้า กดลิงก์ในคอมเมนต์แรก",
  ];
  const subtitleScript = [
    `🔥 ${product.name}`,
    `เช็กข้อมูลและโปรล่าสุดก่อนตัดสินใจ`,
    `ดูจุดเด่นและรายละเอียดสินค้า`,
    original && discount ? `จาก ${original} เหลือ ${price}` : `ราคา ${price}`,
    "👇 กดลิงก์ในคอมเมนต์แรก",
  ];

  return {
    title: product.name,
    hook,
    body,
    caption,
    callToAction,
    hashtags,
    productUrl,
    firstComment,
    voiceScript,
    subtitleScript,
  };
}

export function validateProductForContent(product: Product): string[] {
  const errors: string[] = [];
  if (!product.name?.trim()) errors.push("missing product name");
  try { validateUrl(product.url); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return errors;
}
