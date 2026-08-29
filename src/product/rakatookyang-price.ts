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
  if (!/^https?:\/\/\S+$/i.test(inputUrl)) {
    throw new Error("Rakatookyang requires a valid http:// or https:// URL.");
  }

  const browser = new BrowserController({ launchIfNeeded: true, headless: false });
  try {
    await browser.connect();
    await browser.open(BASE_URL);
    await browser.wait(3500);

    const result = await browser.evaluate<RakatookyangPageResult>(`(${submitAndRead.toString()})(${JSON.stringify(inputUrl)})`);
    if (!result) throw new Error("Rakatookyang returned no browser result.");
    if (result.status === "blocked") {
      throw new Error(`Rakatookyang blocked the request. URL: ${result.url ?? BASE_URL}`);
    }
    if (result.error) {
      throw new Error(`Rakatookyang browser error: ${result.error} URL: ${result.url ?? BASE_URL}`);
    }
    if (!result.name && !result.price && !result.priceHistory?.length) {
      throw new Error(`Rakatookyang did not return price data. URL: ${result.url ?? BASE_URL}`);
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
  const blocked = (text: string) => /captcha|access denied|too many requests|\b429\b|cloudflare|verify you are human/i.test(text);
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const price = (s: string): number | undefined => {
    const m = s.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? s.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
    if (!m) return undefined;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    if (blocked(`${document.body?.innerText ?? ""} ${document.title}`)) return { status: "blocked", ...state() };

    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>("input, textarea, [contenteditable='true']"));
    const input = fields.find((el) => /shopee|ลิงก์|link|url|สินค้า|product|ค้นหา|search/i.test(
      `${el.getAttribute("placeholder") ?? ""} ${el.getAttribute("name") ?? ""} ${el.id} ${el.getAttribute("aria-label") ?? ""}`,
    )) ?? fields.find((el) => {
      const type = el instanceof HTMLInputElement ? el.type : "";
      return !["hidden", "submit", "button"].includes(type);
    });

    if (!input) return { status: "empty", ...state(), error: "Rakatookyang input field was not found." };

    input.focus();
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
      if (setter) setter.call(input, inputUrl); else input.value = inputUrl;
    } else {
      input.textContent = inputUrl;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const form = input.closest("form");
    const button = form?.querySelector<HTMLButtonElement>('button[type="submit"],button') ??
      Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => /เช็กราคา|เช็ค|ตรวจ|เช็ก|ค้นหา|search|check|price|submit/i.test(b.innerText || b.getAttribute("aria-label") || ""));

    if (button) button.click();
    else if (form) form.requestSubmit();
    else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));

    const startedAt = Date.now();
    while (Date.now() - startedAt < 12000) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const text = document.body?.innerText ?? "";
      if (blocked(text)) return { status: "blocked", ...state() };
      if (/(฿|บาท|THB)\s*[\d,]+/i.test(text) || (location.href !== "https://rakatookyang.com/" && location.href !== "https://rakatookyang.com")) break;
    }

    const text = document.body?.innerText ?? "";
    if (blocked(text)) return { status: "blocked", ...state() };

    const bodyLines = text.split(/\n+/).map(clean).filter(Boolean);
    const prices: Array<{ date?: string; price: number }> = [];
    for (const line of bodyLines) {
      const p = price(line);
      if (p !== undefined) {
        const date = line.match(/\b(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/)?.[1];
        if (!prices.some((x) => x.price === p && x.date === date)) prices.push({ ...(date ? { date } : {}), price: p });
      }
    }

    // Rakatookyang may render chart data into scripts instead of visible text.
    for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>("script"))) {
      const raw = script.textContent || "";
      if (!/price|ราคา|history|ประวัติ/i.test(raw)) continue;
      const matches = raw.match(/(?:price|ราคา)\s*[:=]\s*["']?([\d,]+(?:\.\d{1,2})?)/gi) ?? [];
      for (const match of matches) {
        const p = price(match);
        if (p !== undefined && !prices.some((x) => x.price === p)) prices.push({ price: p });
      }
    }

    const heading = Array.from(document.querySelectorAll<HTMLElement>("h1,h2,h3,[class*='title'],[class*='product']"))
      .map((el) => clean(el.innerText || ""))
      .find((x) => x.length >= 5);
    const currentPrice = price(text);
    const discount = text.match(/(\d{1,2})\s*%/)?.[1];
    const rating = text.match(/(?:★|⭐)\s*(\d(?:\.\d)?)/)?.[1];

    return {
      status: prices.length || currentPrice !== undefined ? "ready" : "empty",
      ...state(),
      ...(heading ? { name: heading } : {}),
      ...(currentPrice !== undefined ? { price: currentPrice } : {}),
      ...(discount ? { discount: Number(discount) } : {}),
      ...(rating ? { rating: Number(rating) } : {}),
      sourceUrl: inputUrl,
      priceHistory: prices,
    };
  } catch (error) {
    return { status: "empty", ...state(), error: error instanceof Error ? error.message : String(error) };
  }
}
