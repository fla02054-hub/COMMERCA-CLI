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
  voiceScript?: string[];
  subtitleScript?: string[];
}

export function validateUrl(url: string | undefined): string {
  if (!url?.trim()) throw new Error("Product URL is required for publish-ready content.");
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname) throw new Error();
  } catch {
    throw new Error("Product URL must be a valid http(s) URL.");
  }
  return url.trim();
}

function money(value: number | undefined): string { return value === undefined ? "เช็กราคาล่าสุด" : `฿${value.toLocaleString("th-TH")}`; }

function shortProductName(name: string): string {
  const n = name.replace(/\s+/g, " ").trim();
  const brand = n.split(" ")[0] ?? "สินค้า";
  const lower = n.toLowerCase();
  if (/หมอน/.test(n)) return `${brand} หมอนสุขภาพ`;
  if (/(รองเท้า|sneaker|running|วิ่ง)/i.test(lower)) return `${brand} รองเท้าวิ่ง`;
  if (/(จักรยาน|electric.?bike|ebike)/i.test(lower)) return `${brand} จักรยานไฟฟ้า`;
  if (/(power.?bank|แบต|charger|ชาร์จ)/i.test(lower)) return `${brand} Power Bank`;
  if (/(โลชั่น|ครีม|skincare|ผิว)/i.test(lower)) return `${brand} ดูแลผิว`;
  return n.length <= 52 ? n : `${n.slice(0, 49).replace(/\s+\S*$/, "")}...`;
}

function featurePhrases(product: Product): string[] {
  const name = product.name;
  const candidates = ["แก้ปวดคอ บ่า ไหล่", "สัมผัสนุ่ม", "3D", "ลดการนอนกรน", "ป้องกันไรฝุ่น", "ไม่เสียรูปหลังนอนนาน", "พับได้", "ไฟฟ้า", "ชาร์จเร็ว", "กันน้ำ"];
  return [...new Set(candidates.filter((phrase) => name.toLowerCase().includes(phrase.toLowerCase())))].slice(0, 4);
}

function categoryHashtags(name: string): string[] {
  const lower = name.toLowerCase();
  if (/หมอน/.test(name)) return ["#หมอนสุขภาพ", "#หมอนแก้ปวดคอ", "#ของใช้ในบ้าน"];
  if (/(รองเท้า|วิ่ง|sneaker|running)/i.test(lower)) return ["#รองเท้าวิ่ง", "#รองเท้าผ้าใบ", "#ของดีบอกต่อ"];
  if (/(จักรยาน|electric.?bike|ebike)/i.test(lower)) return ["#จักรยานไฟฟ้า", "#จักรยานพับได้", "#ของดีบอกต่อ"];
  if (/(บ้าน|ครัว|เครื่องใช้|home)/i.test(lower)) return ["#ของใช้ในบ้าน", "#ของใช้ดีบอกต่อ", "#ช้อปปิ้งออนไลน์"];
  return ["#ช้อปปิ้งออนไลน์", "#ของดีบอกต่อ", "#โปรเด็ด"];
}

function discountText(product: Product): string | undefined {
  if (product.price === undefined || product.originalPrice === undefined || product.originalPrice <= product.price) return undefined;
  const percent = Math.round((1 - product.price / product.originalPrice) * 100);
  return `🔥 จาก ${money(product.originalPrice)} เหลือ ${money(product.price)} | ลด ${percent}%`;
}

function proofLines(product: Product): string[] {
  const proof: string[] = [];
  if (product.rating !== undefined) proof.push(`⭐ ${product.rating}/5`);
  if (product.reviewCount !== undefined) proof.push(`${product.reviewCount.toLocaleString("th-TH")} รีวิว`);
  if (product.salesCount !== undefined) proof.push(`ขายแล้ว ${product.salesCount.toLocaleString("th-TH")} ชิ้น`);
  return proof;
}

export function buildContentStrategy(analysis: ProductAnalysis): ContentStrategy {
  const { product } = analysis;
  const productUrl = validateUrl(product.url);
  const displayName = shortProductName(product.name);
  const price = money(product.price);
  const original = money(product.originalPrice);
  return {
    angles: ["ปัญหา/ความต้องการ", "จุดเด่นที่ยืนยันได้", "ราคาและโปร"],
    hooks: [
      product.originalPrice !== undefined && product.price !== undefined ? `🔥 ${displayName} จาก ${original} เหลือ ${price}` : `🔥 ${displayName} น่าสนใจสำหรับคนกำลังหาอยู่`,
      `👀 กำลังมองหา ${displayName} อยู่? ลองดูดีลนี้`,
      `💥 ${displayName} โปรน่าสนใจ เช็กก่อนหมดโปร`,
    ],
    copyBrief: "เขียน Social Commerce ภาษาไทยแบบสั้นและอ่านเร็ว โดยใช้ชื่อสินค้าแบบสั้นที่อ่านง่าย ใช้เฉพาะข้อมูลสินค้า/โปรที่ยืนยันได้ ห้ามแต่งสเปก รีวิว ยอดขาย หรือคำกล่าวอ้าง ห้ามใส่ URL ใน caption และให้ลิงก์อยู่ใน firstComment เท่านั้น",
    callToAction: "👇 สนใจสินค้า กดลิงก์ในคอมเมนต์แรก",
    productUrl,
  };
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
  const displayName = shortProductName(product.name);
  const features = featurePhrases(product);
  const proof = proofLines(product);
  const discount = discountText(product);
  const promotion = product.promotion?.trim();
  const hook = discount ? `🔥 ${displayName} ราคานี้น่าสนใจ!` : `🔥 ${displayName} น่าสนใจสำหรับคนกำลังหาอยู่`;
  const benefit = features.length ? `✨ จุดเด่น: ${features.join(" • ")}` : "✨ เช็กจุดเด่นและรายละเอียดเพิ่มเติมได้จากหน้าสินค้า";
  const proofLine = proof.length ? `📌 ${proof.join(" • ")}` : undefined;
  const priceLine = discount ?? (product.price !== undefined ? `💰 ราคา ${money(product.price)}` : "💰 เช็กราคาล่าสุดในหน้าสินค้า");
  const promoLine = promotion && promotion !== discount ? `🎁 ${promotion}` : undefined;
  const hashtags = [...categoryHashtags(product.name), "#Shopee", "#ShopeeSale"].slice(0, 5);
  const body = [benefit, proofLine, promoLine, priceLine].filter(Boolean).join("\n\n");
  const callToAction = "👇 สนใจสินค้า กดลิงก์ในคอมเมนต์แรก";
  const caption = `${hook}\n\n${body}\n\n${callToAction}\n\n${hashtags.join(" ")}`;
  const firstComment = `🛒 พิกัดสินค้า 👇\n🔗 ${productUrl}`;
  const voiceScript = [
    `${hook.replace("!", "")}. ${features.slice(0, 2).join(" และ ") || "ลองเช็กจุดเด่นของสินค้า"} ${priceLine.replace("💥 ", "").replace("💰 ", "")}`,
    `${displayName} เหมาะกับคนที่กำลังมองหาตัวเลือกที่ตอบโจทย์การใช้งาน โดยจุดเด่นที่ระบุไว้คือ ${features.slice(0, 3).join(", ") || "รายละเอียดตามหน้าสินค้า"}`,
    `ดูตัวสินค้าและรายละเอียดกันชัด ๆ ${features.length ? `โดยมี ${features.slice(0, 3).join(", ")}` : "พร้อมตรวจสอบรายละเอียดก่อนซื้อ"}`,
    `${discount ? discount.replace("🔥 ", "") : priceLine.replace("💰 ", "")}${proof.length ? ` และ ${proof.join(" และ ")}` : ""} ก่อนตัดสินใจลองเช็กโปรล่าสุดอีกครั้ง`,
    `ถ้าสนใจ ${displayName} กดดูรายละเอียดจากลิงก์ที่แนบไว้ในคอมเมนต์แรกได้เลย`,
  ];
  const subtitleScript = [`🔥 ${displayName}`, features.slice(0, 2).join(" • ") || "จุดเด่นน่าสนใจ", features[2] || "ดูรายละเอียดสินค้า", discount || priceLine, "👇 ดูลิงก์ในคอมเมนต์แรก"];
  return { title: displayName, hook, body, caption, callToAction, hashtags, productUrl, firstComment, voiceScript, subtitleScript };
}

export function validateProductForContent(product: Product): string[] {
  const errors: string[] = [];
  if (!product.name?.trim()) errors.push("missing product name");
  try { validateUrl(product.url); } catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
  return errors;
}
