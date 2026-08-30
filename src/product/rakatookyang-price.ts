import { BrowserController } from "../browser/controller.js";
import type { Product } from "./types.js";

const BASE_URL = "https://rakatookyang.com/";

export interface RakatookyangPriceResult extends Product {
  source: "rakatookyang";
  lowestPrice?: number;
  averagePrice?: number;
  priceHistory?: Array<{ date?: string; price: number }>;
}

export async function readRakatookyangPriceHistory(url: string): Promise<RakatookyangPriceResult> {
  const inputUrl = url.trim();
  if (!/^https?:\/\/\S+$/i.test(inputUrl)) throw new Error("Rakatookyang requires a valid http:// or https:// URL.");

  const browser = new BrowserController({ launchIfNeeded: true, headless: false, useExistingChromeProfile: true });
  try {
    await browser.connect();
    await browser.open(BASE_URL);
    await browser.wait(5000);

    const result = await browser.evaluate<RakatookyangPageResult>(`(${submitAndRead.toString()})(${JSON.stringify(inputUrl)})`);
    if (!result) throw new Error("Rakatookyang returned no browser result.");
    if (result.status === "blocked") throw new Error(`Rakatookyang blocked the request. URL: ${result.url ?? BASE_URL}`);
    if (result.error) throw new Error(`Rakatookyang browser error: ${result.error} URL: ${result.url ?? BASE_URL}`);
    if (!result.name && result.price === undefined && !result.priceHistory?.length) {
      throw new Error(`Rakatookyang search completed without product data. URL: ${result.url ?? BASE_URL}`);
    }

    const history = result.priceHistory ?? [];
    const prices = history.map((item) => item.price).filter(Number.isFinite);
    if (result.price !== undefined) prices.push(result.price);
    const lowestPrice = prices.length ? Math.min(...prices) : undefined;
    const averagePrice = prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100 : undefined;

    return {
      id: `rakatookyang-${Date.now()}`,
      name: result.name ?? "Product",
      ...(result.price !== undefined ? { price: result.price } : {}),
      ...(result.originalPrice !== undefined ? { originalPrice: result.originalPrice } : {}),
      ...(lowestPrice !== undefined ? { lowestPrice } : {}),
      ...(averagePrice !== undefined ? { averagePrice } : {}),
      ...(result.discount !== undefined ? { discount: result.discount } : {}),
      ...(result.rating !== undefined ? { rating: result.rating } : {}),
      ...(result.reviewCount !== undefined ? { reviewCount: result.reviewCount } : {}),
      ...(result.seller ? { seller: result.seller } : {}),
      url: result.sourceUrl ?? inputUrl,
      source: "rakatookyang",
      discoveredAt: new Date().toISOString(),
      priceHistory: history,
    };
  } finally {
    browser.close();
  }
}

interface RakatookyangPageResult {
  status: "ready" | "blocked" | "empty";
  url: string;
  name?: string;
  price?: number;
  originalPrice?: number;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  seller?: string;
  sourceUrl?: string;
  priceHistory?: Array<{ date?: string; price: number }>;
  error?: string;
}

async function submitAndRead(inputUrl: string): Promise<RakatookyangPageResult> {
  const state = () => ({ url: location.href, title: document.title });
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const blocked = (text: string) => /captcha|access denied|too many requests|\b429\b|cloudflare|verify you are human/i.test(text);
  const parsePrice = (s: string): number | undefined => {
    const m = s.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? s.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
    if (!m) return undefined;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };
  const collectJson = (raw: string, out: Record<string, unknown>[]) => {
    try { const v = JSON.parse(raw); if (v && typeof v === "object") out.push(v); } catch { /* not JSON */ }
  };

  try {
    let text = document.body?.innerText ?? "";
    if (blocked(`${text} ${document.title}`)) return { status: "blocked", ...state() };

    const allFields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea"));
    const field = allFields.find((el) => /url|link|ลิงก์|สินค้า|product|shopee|ค้นหา|search/i.test(`${el.placeholder} ${el.name} ${el.id} ${el.getAttribute("aria-label") ?? ""}`))
      ?? allFields.find((el) => !["hidden", "submit", "button"].includes(el.type));
    if (!field) return { status: "empty", ...state(), error: "Rakatookyang input field was not found." };

    field.focus();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (field instanceof HTMLInputElement && setter) setter.call(field, inputUrl);
    else field.value = inputUrl;
    for (const type of ["input", "change", "blur"]) field.dispatchEvent(new Event(type, { bubbles: true }));

    const form = field.closest("form");
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button,input[type=submit]"));
    const button = buttons.find((b) => /เช็กราคา|เช็ค|ตรวจ|เช็ก|ค้นหา|search|check|price/i.test(clean(b.innerText || b.getAttribute("aria-label") || (b as HTMLInputElement).value || "")))
      ?? form?.querySelector<HTMLButtonElement>("button[type=submit],input[type=submit]");

    if (button) button.click();
    else if (form) form.requestSubmit();
    else field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));

    const started = Date.now();
    while (Date.now() - started < 30000) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      text = document.body?.innerText ?? "";
      if (blocked(`${text} ${document.title}`)) return { status: "blocked", ...state() };
      const hasPrice = /(?:฿|บาท|THB)\s*[\d,]+/i.test(text);
      const hasResultWords = /ราคาย้อนหลัง|ประวัติราคา|ราคาปัจจุบัน|ราคาต่ำสุด|price history|price tracker/i.test(text);
      if (hasPrice || hasResultWords || location.href !== BASE_URL) break;
    }

    text = document.body?.innerText ?? "";
    const prices: Array<{ date?: string; price: number }> = [];
    for (const line of text.split(/\n+/).map(clean).filter(Boolean)) {
      const p = parsePrice(line);
      if (p !== undefined) {
        const date = line.match(/\b(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/)?.[1];
        if (!prices.some((x) => x.price === p && x.date === date)) prices.push({ ...(date ? { date } : {}), price: p });
      }
    }

    // SPA sites often keep the result in JSON-LD or Next/Vite state rather than visible text.
    const objects: Record<string, unknown>[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json'],script"))) {
      const raw = el.textContent || "";
      if (el.type === "application/ld+json") collectJson(raw, objects);
      if (/price|ราคา|history|ประวัติ/i.test(raw)) {
        for (const match of raw.matchAll(/(?:price|ราคา)\s*["']?\s*[:=]\s*["']?([\d,]+(?:\.\d{1,2})?)/gi)) {
          const p = parsePrice(match[0]);
          if (p !== undefined && !prices.some((x) => x.price === p)) prices.push({ price: p });
        }
      }
    }

    const flatten = (value: unknown): unknown[] => {
      if (Array.isArray(value)) return value.flatMap(flatten);
      if (value && typeof value === "object") return [value, ...Object.values(value as Record<string, unknown>).flatMap(flatten)];
      return [];
    };
    for (const obj of objects.flatMap(flatten)) {
      if (!obj || typeof obj !== "object") continue;
      const r = obj as Record<string, unknown>;
      const p = typeof r.price === "number" ? r.price : typeof r.price === "string" ? parsePrice(r.price) : undefined;
      if (p !== undefined && !prices.some((x) => x.price === p)) prices.push({ price: p });
    }

    const name = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,[class*='title'],[class*='product']"))
      .map((el) => clean(el.innerText || ""))
      .find((x) => x.length >= 5 && !/ราคาถูก|เช็คราคา|RakaTookYang/i.test(x));
    const currentPrice = parsePrice(text);
    const discountMatch = text.match(/(\d{1,2})\s*%/);
    const ratingMatch = text.match(/(?:★|⭐)\s*(\d(?:\.\d)?)/);

    return {
      status: prices.length || currentPrice !== undefined || !!name ? "ready" : "empty",
      ...state(),
      ...(name ? { name } : {}),
      ...(currentPrice !== undefined ? { price: currentPrice } : {}),
      ...(discountMatch ? { discount: Number(discountMatch[1]) } : {}),
      ...(ratingMatch ? { rating: Number(ratingMatch[1]) } : {}),
      sourceUrl: inputUrl,
      priceHistory: prices,
    };
  } catch (error) {
    return { status: "empty", ...state(), error: error instanceof Error ? error.message : String(error) };
  }
}
