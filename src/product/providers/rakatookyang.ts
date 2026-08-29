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
    const input = query.trim();
    if (!input) throw new Error("Rakatookyang search requires a URL or query.");

    const browser = new BrowserController({ launchIfNeeded: true, headless: false });
    try {
      await browser.connect();
      await browser.open(BASE_URL);
      await browser.wait(2500);

      const result = await browser.evaluate<BrowserSearchResult>(
        `(${buildBrowserSearch.toString()})(${JSON.stringify(input)}, ${MAX_PRODUCTS})`,
      );

      if (!result) throw new Error("Rakatookyang returned no browser result.");
      if (result.error) throw new Error(`Rakatookyang browser error: ${result.error} URL: ${result.url ?? BASE_URL}`);
      if (result.status === "blocked") throw new Error(`Rakatookyang blocked browser access. URL: ${result.url ?? BASE_URL}`);
      if (!Array.isArray(result.products)) throw new Error(`Rakatookyang returned an invalid product result. URL: ${result.url ?? BASE_URL}`);
      if (!result.products.length) throw new Error(`Rakatookyang returned 0 products. URL: ${result.url ?? BASE_URL} Title: ${result.title ?? "unknown"}`);

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
  const clean = (v: string) => v.replace(/\s+/g, " ").trim();
  const blocked = (v: string) => /captcha|access denied|too many requests|cloudflare|verify you are human/i.test(v);
  const priceFrom = (v: string): number | undefined => {
    const m = v.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? v.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
    if (!m) return undefined;
    const n = Number(m[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  };

  try {
    if (blocked(`${document.title} ${document.body?.innerText ?? ""}`)) return { ...state(), status: "blocked", products: [] };

    const visible = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };

    const fields = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))
      .filter(visible)
      .filter((el) => !["hidden", "submit", "button", "checkbox", "radio"].includes(el.type));

    const score = (el: HTMLInputElement | HTMLTextAreaElement) => {
      const text = `${el.placeholder} ${el.name} ${el.id} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("type") ?? ""}`.toLowerCase();
      let n = 0;
      if (/url|link|ลิงก์|สินค้า|product/.test(text)) n += 10;
      if (/search|ค้นหา|keyword|query/.test(text)) n += 8;
      if (el.tagName === "TEXTAREA") n += 2;
      if (el.type === "text" || el.type === "url" || el.type === "search") n += 3;
      return n;
    };

    const field = [...fields].sort((a, b) => score(b) - score(a))[0];
    if (!field) return { ...state(), status: "empty", products: [], error: "Rakatookyang search input was not found." };

    field.focus();
    field.select?.();
    const proto = Object.getPrototypeOf(field);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, query);
    else field.value = query;
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: query }));
    field.dispatchEvent(new Event("change", { bubbles: true }));

    const form = field.closest("form");
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button, input[type='submit']")).filter(visible);
    const button = buttons.sort((a, b) => {
      const aText = `${a.innerText} ${a.getAttribute("aria-label") ?? ""} ${a.getAttribute("title") ?? ""}`;
      const bText = `${b.innerText} ${b.getAttribute("aria-label") ?? ""} ${b.getAttribute("title") ?? ""}`;
      const s = (v: string) => /ค้นหา|เช็กราคา|เช็คราคา|ตรวจราคา|search|check|price|submit/i.test(v) ? 10 : 0;
      return s(bText) - s(aText);
    })[0];

    if (button) button.click();
    else if (form) {
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.submit();
    } else {
      field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
      field.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }

    const started = Date.now();
    let lastBody = "";
    while (Date.now() - started < 15000) {
      await new Promise((r) => setTimeout(r, 500));
      lastBody = document.body?.innerText ?? "";
      if (blocked(`${document.title} ${lastBody}`)) return { ...state(), status: "blocked", products: [] };
      const hasPrice = /(?:฿|THB|บาท)\s*[\d,]+|[\d,]+\s*(?:บาท|THB)/i.test(lastBody);
      const hasResult = /ประวัติราคา|ราคาต่ำสุด|ราคาเฉลี่ย|price history|lowest price|average price/i.test(lastBody);
      if (hasPrice || hasResult) break;
    }

    const products: BrowserProduct[] = [];
    const seen = new Set<string>();
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("article, li, [class*='product'], [class*='item'], a[href]"));
    for (const node of nodes) {
      if (products.length >= maxProducts) break;
      const link = node.matches("a[href]") ? node as HTMLAnchorElement : node.querySelector<HTMLAnchorElement>("a[href]");
      const url = link?.href ?? location.href;
      if (seen.has(url)) continue;
      const text = clean(node.innerText || link?.innerText || "");
      if (text.length < 3) continue;
      const title = clean(node.querySelector<HTMLElement>("h1,h2,h3,h4,h5,[class*='title'],[class*='name']")?.innerText || link?.innerText || "");
      const name = title.length >= 3 ? title : clean(text.split(/(?:฿|THB|บาท)/i)[0]);
      if (name.length < 3 || /^(home|search|menu|login|เข้าสู่ระบบ)$/i.test(name)) continue;
      const price = priceFrom(text);
      const discount = text.match(/(\d{1,2})\s*%/);
      const rating = text.match(/(?:★|⭐)\s*(\d(?:\.\d)?)/);
      const image = node.querySelector<HTMLImageElement>("img")?.src;
      seen.add(url);
      products.push({ name, url, ...(price !== undefined ? { price } : {}), ...(discount ? { discount: Number(discount[1]) } : {}), ...(rating ? { rating: Number(rating[1]) } : {}), ...(image ? { image } : {}) });
    }

    if (!products.length) {
      const title = clean(document.querySelector("h1,h2,h3")?.textContent ?? "");
      const price = priceFrom(lastBody);
      if (title && price !== undefined) products.push({ name: title, price, url: location.href });
    }

    return { ...state(), status: products.length ? "ready" : "empty", products };
  } catch (error) {
    return { ...state(), status: "empty", products: [], error: error instanceof Error ? error.message : String(error) };
  }
}
