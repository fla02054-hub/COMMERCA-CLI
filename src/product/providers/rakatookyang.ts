import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";
import { BrowserController } from "../../browser/controller.js";

const BASE_URL = "https://rakatookyang.com/";
const MAX_PRODUCTS = 50;

export class RakatookyangProvider implements ProductProvider {
  readonly name = "rakatookyang";

  async search(query: string): Promise<Product[]> {
    const browser = new BrowserController({ launchIfNeeded: true, headless: false });

    try {
      await browser.connect();
      await browser.open(BASE_URL);
      await browser.wait(2500);

      const result = await browser.evaluate<{
        url: string;
        title: string;
        status: "ready" | "blocked" | "empty";
        products: Array<{
          name: string;
          price?: number;
          originalPrice?: number;
          discount?: number;
          rating?: number;
          reviewCount?: number;
          salesCount?: number;
          seller?: string;
          url?: string;
          image?: string;
        }>;
      }>(`(${buildBrowserSearch.toString()})(${JSON.stringify(query)}, ${MAX_PRODUCTS})`);

      if (result.status === "blocked") {
        throw new Error(`Rakatookyang blocked browser access. URL: ${result.url}`);
      }

      if (result.products.length === 0) {
        throw new Error(
          `Rakatookyang browser search returned 0 products. URL: ${result.url} Title: ${result.title}`,
        );
      }

      return result.products.map((item, index) => ({
        id: `rakatookyang-${index + 1}`,
        name: item.name,
        ...(item.price !== undefined ? { price: item.price } : {}),
        ...(item.originalPrice !== undefined ? { originalPrice: item.originalPrice } : {}),
        ...(item.discount !== undefined ? { discount: item.discount } : {}),
        ...(item.rating !== undefined ? { rating: item.rating } : {}),
        ...(item.reviewCount !== undefined ? { reviewCount: item.reviewCount } : {}),
        ...(item.salesCount !== undefined ? { salesCount: item.salesCount } : {}),
        ...(item.seller ? { seller: item.seller } : {}),
        ...(item.url ? { url: item.url } : {}),
        ...(item.image ? { image: item.image } : {}),
        source: "rakatookyang",
        discoveredAt: new Date().toISOString(),
      }));
    } finally {
      browser.close();
    }
  }
}

async function buildBrowserSearch(query: string, maxProducts: number) {
  const blockedText = `${document.body?.innerText ?? ""} ${document.title}`.toLowerCase();
  if (/captcha|access denied|too many requests|429|cloudflare|verify you are human/.test(blockedText)) {
    return { url: location.href, title: document.title, status: "blocked" as const, products: [] };
  }

  const input = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
    .find((element) => {
      const text = `${element.placeholder} ${element.name} ${element.getAttribute("aria-label") ?? ""}`.toLowerCase();
      return /search|ค้นหา|keyword|query/.test(text);
    });

  if (input) {
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    setter?.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const form = input.closest("form");
    if (form) {
      form.requestSubmit();
    } else {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 3500));

  const bodyText = document.body?.innerText ?? "";
  if (/captcha|access denied|too many requests|429|cloudflare|verify you are human/.test(bodyText.toLowerCase())) {
    return { url: location.href, title: document.title, status: "blocked" as const, products: [] };
  }

  const absolute = (value: string) => {
    try { return new URL(value, location.href).href; } catch { return undefined; }
  };

  const priceFrom = (text: string): number | undefined => {
    const match = text.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
    if (!match) return undefined;
    const value = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(value) ? value : undefined;
  };

  const candidates = Array.from(document.querySelectorAll<HTMLElement>("a[href], article, li, .product, [class*='product'], [class*='item']"));
  const products: Array<{ name: string; price?: number; originalPrice?: number; discount?: number; rating?: number; reviewCount?: number; salesCount?: number; seller?: string; url?: string; image?: string }> = [];
  const seen = new Set<string>();

  for (const element of candidates) {
    if (products.length >= maxProducts) break;
    const link = element.matches("a[href]") ? element as HTMLAnchorElement : element.querySelector<HTMLAnchorElement>("a[href]");
    const url = link?.href ? absolute(link.href) : undefined;
    if (!url || seen.has(url) || new URL(url).hostname !== location.hostname) continue;

    const text = (element.innerText || link.innerText || "").replace(/\s+/g, " ").trim();
    if (text.length < 4) continue;

    const nameElement = element.querySelector<HTMLElement>("h1,h2,h3,h4,h5,[class*='title'],[class*='name']");
    const name = (nameElement?.innerText || link.innerText || "").replace(/\s+/g, " ").trim();
    if (name.length < 3 || /^(home|search|menu|login|เข้าสู่ระบบ)$/i.test(name)) continue;

    const image = element.querySelector<HTMLImageElement>("img")?.src;
    const price = priceFrom(text);
    const discountMatch = text.match(/(\d{1,2})\s*%/);
    const ratingMatch = text.match(/(?:★|⭐)\s*(\d(?:\.\d)?)/);
    const salesMatch = text.match(/(?:ขายแล้ว|sold)\s*([\d,.]+)\s*([kK]?)/i);

    seen.add(url);
    products.push({
      name,
      ...(price !== undefined ? { price } : {}),
      ...(discountMatch ? { discount: Number(discountMatch[1]) } : {}),
      ...(ratingMatch ? { rating: Number(ratingMatch[1]) } : {}),
      ...(salesMatch ? { salesCount: Math.round(Number(salesMatch[1].replace(/,/g, "")) * (salesMatch[2] ? 1000 : 1)) } : {}),
      url,
      ...(image ? { image } : {}),
    });
  }

  return { url: location.href, title: document.title, status: products.length ? "ready" as const : "empty" as const, products };
}
