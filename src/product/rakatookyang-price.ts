import { BrowserController } from "../browser/controller.js";
import type { Product } from "./types.js";

const BASE_URL = "https://rakatookyang.com/";

export interface RakatookyangPriceResult extends Product {
  source: "rakatookyang";
  lowestPrice?: number;
  averagePrice?: number;
  priceHistory?: Array<{ date?: string; price: number }>;
}

export async function readRakatookyangPriceHistory(shopeeUrl: string): Promise<RakatookyangPriceResult> {
  if (!/^https?:\/\/(?:www\.)?shopee\.co\.th\//i.test(shopeeUrl)) {
    throw new Error("Rakatookyang requires a Shopee product URL copied from Shopee.");
  }

  const browser = new BrowserController({ launchIfNeeded: true, headless: false });
  try {
    await browser.connect();
    await browser.open(BASE_URL);
    await browser.wait(2000);

    const result = await browser.evaluate<RakatookyangPageResult>(`(${submitAndRead.toString()})(${JSON.stringify(shopeeUrl)})`);
    if (!result || result.status === "blocked") {
      throw new Error(`Rakatookyang blocked the request. URL: ${result?.url ?? BASE_URL}`);
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
      name: result.name ?? "Shopee product",
      ...(result.price !== undefined ? { price: result.price } : {}),
      ...(result.originalPrice !== undefined ? { originalPrice: result.originalPrice } : {}),
      ...(lowestPrice !== undefined ? { lowestPrice } : {}),
      ...(averagePrice !== undefined ? { averagePrice } : {}),
      ...(result.discount !== undefined ? { discount: result.discount } : {}),
      ...(result.rating !== undefined ? { rating: result.rating } : {}),
      ...(result.reviewCount !== undefined ? { reviewCount: result.reviewCount } : {}),
      ...(result.seller ? { seller: result.seller } : {}),
      url: result.shopeeUrl ?? shopeeUrl,
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
  shopeeUrl?: string;
  priceHistory?: Array<{ date?: string; price: number }>;
}

async function submitAndRead(shopeeUrl: string): Promise<RakatookyangPageResult> {
  const state = () => ({ url: location.href, title: document.title });
  const blocked = (text: string) => /captcha|access denied|too many requests|\b429\b|cloudflare|verify you are human/i.test(text);
  if (blocked(`${document.body?.innerText ?? ""} ${document.title}`)) return { status: "blocked", ...state() };

  const inputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"));
  const input = inputs.find((el) => /shopee|ลิงก์|link|url|สินค้า|product/i.test(`${el.placeholder} ${el.name} ${el.getAttribute("aria-label") ?? ""}`)) ?? inputs[0];
  if (!input) return { status: "empty", ...state() };

  input.focus();
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (setter) setter.call(input, shopeeUrl); else input.value = shopeeUrl;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  const form = input.closest("form");
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"],button') ?? Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((b) => /เช็ค|ตรวจ|ดู|check|analy|price/i.test(b.innerText || b.getAttribute("aria-label") || ""));
  if (button) button.click();
  else if (form) form.requestSubmit();
  else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const text = document.body?.innerText ?? "";
  if (blocked(text)) return { status: "blocked", ...state() };

  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const price = (s: string): number | undefined => {
    const m = s.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? s.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
    if (!m) return undefined;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };

  const bodyLines = text.split(/\n+/).map(clean).filter(Boolean);
  const prices: Array<{ date?: string; price: number }> = [];
  for (const line of bodyLines) {
    const p = price(line);
    if (p !== undefined) {
      const date = line.match(/\b(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})\b/)?.[1];
      if (!prices.some((x) => x.price === p && x.date === date)) prices.push({ ...(date ? { date } : {}), price: p });
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
    shopeeUrl,
    priceHistory: prices,
  };
}
