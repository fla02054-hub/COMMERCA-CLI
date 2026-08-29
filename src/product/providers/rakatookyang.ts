import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";
import { BrowserController } from "../../browser/controller.js";

const BASE_URL = "https://rakatookyang.com/";
const MAX_PRODUCTS = 50;

interface BrowserProduct {
  name: string;
  price?: number;
  originalPrice?: number;
  lowestPrice?: number;
  averagePrice?: number;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  salesCount?: number;
  seller?: string;
  url?: string;
  image?: string;
  promotion?: string;
}

interface BrowserSearchResult {
  url?: string;
  title?: string;
  status?: "ready" | "blocked" | "empty";
  products?: BrowserProduct[];
  error?: string;
}

export class RakatookyangProvider implements ProductProvider {
  readonly name = "rakatookyang";

  async search(query: string): Promise<Product[]> {
    const browser = new BrowserController({ launchIfNeeded: true, headless: false });

    try {
      await browser.connect();
      await browser.open(BASE_URL);
      await browser.wait(2500);

      const result = await browser.evaluate<BrowserSearchResult>(
        `(${buildBrowserSearch.toString()})(${JSON.stringify(query)}, ${MAX_PRODUCTS})`,
      );

      if (!result || !Array.isArray(result.products)) {
        throw new Error(`Rakatookyang browser returned an invalid result. URL: ${result?.url ?? "unknown"}`);
      }
      if (result.status === "blocked") {
        throw new Error(`Rakatookyang blocked browser access. URL: ${result.url ?? "unknown"}`);
      }
      if (result.products.length === 0) {
        throw new Error(`Rakatookyang returned 0 products. URL: ${result.url ?? "unknown"} Title: ${result.title ?? "unknown"}`);
      }

      return result.products.map((item, index) => ({
        id: `rakatookyang-${index + 1}`,
        name: item.name,
        ...(item.price !== undefined ? { price: item.price } : {}),
        ...(item.originalPrice !== undefined ? { originalPrice: item.originalPrice } : {}),
        ...(item.lowestPrice !== undefined ? { lowestPrice: item.lowestPrice } : {}),
        ...(item.averagePrice !== undefined ? { averagePrice: item.averagePrice } : {}),
        ...(item.discount !== undefined ? { discount: item.discount } : {}),
        ...(item.rating !== undefined ? { rating: item.rating } : {}),
        ...(item.reviewCount !== undefined ? { reviewCount: item.reviewCount } : {}),
        ...(item.salesCount !== undefined ? { salesCount: item.salesCount } : {}),
        ...(item.seller ? { seller: item.seller } : {}),
        ...(item.promotion ? { promotion: item.promotion } : {}),
        ...(item.url ? { url: item.url } : {}),
        source: "rakatookyang",
        discoveredAt: new Date().toISOString(),
      }));
    } finally {
      browser.close();
    }
  }
}

async function buildBrowserSearch(query: string, maxProducts: number): Promise<BrowserSearchResult> {
  const state = () => ({ url: location.href, title: document.title });
  const blocked = (text: string) => /captcha|access denied|too many requests|\b429\b|cloudflare|verify you are human/.test(text.toLowerCase());
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const priceFrom = (value: string): number | undefined => {
    const match = value.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? value.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
    if (!match) return undefined;
    const number = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(number) ? number : undefined;
  };

  if (blocked(`${document.body?.innerText ?? ""} ${document.title}`)) {
    return { ...state(), status: "blocked", products: [] };
  }

  // Accept any user-supplied URL/query. The site may expose a search box, a
  // product lookup box, or a normal form. Do not require a specific URL shape.
  const input = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
    .find((element) => /search|ค้นหา|keyword|query|url|ลิงก์|link|สินค้า/i.test(
      `${element.placeholder} ${element.name} ${element.id} ${element.getAttribute("aria-label") ?? ""}`,
    ));

  if (input) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    if (setter) setter.call(input, query);
    else input.value = query;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const form = input.closest("form");
    const button = form?.querySelector<HTMLButtonElement>('button[type="submit"],button') ??
      Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) => /ค้นหา|search|ตรวจ|เช็ก|check|submit/i.test(button.innerText || button.getAttribute("aria-label") || ""));
    if (button) button.click();
    else input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 4500));
  }

  const body = document.body?.innerText ?? "";
  if (blocked(body)) return { ...state(), status: "blocked", products: [] };

  const products: BrowserProduct[] = [];
  const seen = new Set<string>();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("article, li, [class*='product'], [class*='item'], a[href]"));

  for (const element of candidates) {
    if (products.length >= maxProducts) break;
    const link = element.matches("a[href]") ? element as HTMLAnchorElement : element.querySelector<HTMLAnchorElement>("a[href]");
    const url = link?.href;
    if (!url || seen.has(url)) continue;
    const text = clean(element.innerText || link?.innerText || "");
    if (text.length < 3) continue;
    const nameElement = element.querySelector<HTMLElement>("h1,h2,h3,h4,h5,[class*='title'],[class*='name']");
    const name = clean(nameElement?.innerText || link?.innerText || "");
    if (name.length < 3 || /^(home|search|menu|login|เข้าสู่ระบบ)$/i.test(name)) continue;

    const price = priceFrom(text);
    const discountMatch = text.match(/(\d{1,2})\s*%/);
    const ratingMatch = text.match(/(?:★|⭐)\s*(\d(?:\.\d)?)/);
    const image = element.querySelector<HTMLImageElement>("img")?.src;
    seen.add(url);
    products.push({
      name,
      ...(price !== undefined ? { price } : {}),
      ...(discountMatch ? { discount: Number(discountMatch[1]) } : {}),
      ...(ratingMatch ? { rating: Number(ratingMatch[1]) } : {}),
      ...(image ? { image } : {}),
      url,
    });
  }

  // Also support pages whose result is exposed through JSON-LD.
  if (!products.length) {
    for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'))) {
      try {
        const value = JSON.parse(script.textContent || "null");
        const list = Array.isArray(value) ? value : [value];
        for (const item of list) {
          if (!item || typeof item !== "object" || String(item["@type"]).toLowerCase() !== "product") continue;
          const name = typeof item.name === "string" ? clean(item.name) : "";
          const url = typeof item.url === "string" ? new URL(item.url, location.href).href : location.href;
          if (!name) continue;
          const offers = item.offers && typeof item.offers === "object" ? item.offers : undefined;
          const rawPrice = offers && typeof offers.price !== "undefined" ? String(offers.price) : "";
          const numericPrice = Number(rawPrice.replace(/,/g, ""));
          products.push({ name, url, ...(Number.isFinite(numericPrice) ? { price: numericPrice } : {}) });
          if (products.length >= maxProducts) break;
        }
      } catch { /* ignore malformed JSON-LD */ }
    }
  }

  return { ...state(), status: products.length ? "ready" : "empty", products };
}
