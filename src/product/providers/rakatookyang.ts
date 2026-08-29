import { chromium, type Browser, type Page } from "playwright";
import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

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

export class RakatookyangProvider implements ProductProvider {
  readonly name = "rakatookyang";

  async search(query: string): Promise<Product[]> {
    const input = query.trim();
    if (!input) throw new Error("Rakatookyang search requires a URL or query.");

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(1500);

      const body = await page.locator("body").innerText().catch(() => "");
      if (/captcha|access denied|cloudflare|verify you are human/i.test(body)) {
        throw new Error(`Rakatookyang blocked browser access. URL: ${page.url()}`);
      }

      const fields = page.locator("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea");
      const count = await fields.count();
      if (!count) throw new Error(`Rakatookyang search input was not found. URL: ${page.url()}`);

      let best = 0;
      let bestScore = -1;
      for (let i = 0; i < count; i++) {
        const field = fields.nth(i);
        const meta = await field.evaluate((el) => {
          const e = el as HTMLInputElement | HTMLTextAreaElement;
          return `${e.placeholder ?? ""} ${e.name ?? ""} ${e.id ?? ""} ${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("type") ?? ""}`.toLowerCase();
        });
        let score = 0;
        if (/url|link|ลิงก์|สินค้า|product/.test(meta)) score += 10;
        if (/search|ค้นหา|keyword|query|price|ราคา/.test(meta)) score += 8;
        if (/text|url|search/.test(meta)) score += 3;
        if (await field.isVisible().catch(() => false)) score += 2;
        if (score > bestScore) { bestScore = score; best = i; }
      }

      const inputBox = fields.nth(best);
      await inputBox.fill(input);

      const form = inputBox.locator("xpath=ancestor::form[1]");
      const formCount = await form.count();
      const buttons = page.getByRole("button");
      const buttonCount = await buttons.count();
      let clicked = false;
      for (let i = 0; i < buttonCount; i++) {
        const button = buttons.nth(i);
        if (!(await button.isVisible().catch(() => false))) continue;
        const text = await button.innerText().catch(() => "");
        const aria = await button.getAttribute("aria-label").catch(() => null);
        const title = await button.getAttribute("title").catch(() => null);
        if (/ค้นหา|เช็กราคา|เช็คราคา|ตรวจราคา|search|check|price|submit/i.test(`${text} ${aria ?? ""} ${title ?? ""}`)) {
          await button.click();
          clicked = true;
          break;
        }
      }

      if (!clicked && formCount) {
        await form.first().evaluate((el) => {
          const f = el as HTMLFormElement;
          if (typeof f.requestSubmit === "function") f.requestSubmit(); else f.submit();
        });
        clicked = true;
      }

      if (!clicked) await inputBox.press("Enter");

      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

      const products = await extractProducts(page, MAX_PRODUCTS);
      if (!products.length) {
        const currentUrl = page.url();
        const title = await page.title();
        const text = await page.locator("body").innerText().catch(() => "");
        const snippet = text.replace(/\s+/g, " ").slice(0, 500);
        throw new Error(`Rakatookyang returned no product/price data. URL: ${currentUrl} Title: ${title} Text: ${snippet}`);
      }

      return products.map((item, index) => ({
        id: `rakatookyang-${Date.now()}-${index + 1}`,
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
      await browser?.close().catch(() => undefined);
    }
  }
}

async function extractProducts(page: Page, maxProducts: number): Promise<BrowserProduct[]> {
  return page.evaluate((limit) => {
    const clean = (v: string) => v.replace(/\s+/g, " ").trim();
    const priceFrom = (v: string): number | undefined => {
      const m = v.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? v.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
      if (!m) return undefined;
      const n = Number(m[1].replace(/,/g, ""));
      return Number.isFinite(n) ? n : undefined;
    };
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("article, li, [class*='product'], [class*='item'], a[href]"));
    const out: BrowserProduct[] = [];
    const seen = new Set<string>();
    for (const node of nodes) {
      if (out.length >= limit) break;
      const link = node.matches("a[href]") ? node as HTMLAnchorElement : node.querySelector<HTMLAnchorElement>("a[href]");
      const url = link?.href ?? location.href;
      if (seen.has(url)) continue;
      const text = clean(node.innerText || link?.innerText || "");
      if (text.length < 3) continue;
      const heading = clean(node.querySelector<HTMLElement>("h1,h2,h3,h4,h5,[class*='title'],[class*='name']")?.innerText || link?.innerText || "");
      const name = heading.length >= 3 ? heading : clean(text.split(/(?:฿|THB|บาท)/i)[0]);
      if (name.length < 3 || /^(home|search|menu|login|เข้าสู่ระบบ)$/i.test(name)) continue;
      const price = priceFrom(text);
      if (price === undefined && !/ประวัติราคา|ราคาต่ำสุด|ราคาเฉลี่ย|price history|lowest price|average price/i.test(text)) continue;
      const discount = text.match(/(\d{1,2})\s*%/);
      const rating = text.match(/(?:★|⭐)\s*(\d(?:\.\d)?)/);
      const image = node.querySelector<HTMLImageElement>("img")?.src;
      seen.add(url);
      out.push({ name, url, ...(price !== undefined ? { price } : {}), ...(discount ? { discount: Number(discount[1]) } : {}), ...(rating ? { rating: Number(rating[1]) } : {}), ...(image ? { image } : {}) });
    }
    return out;
  }, maxProducts);
}
