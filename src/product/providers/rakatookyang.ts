import { chromium, type Browser, type Page } from "playwright";
import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

const BASE_URL = "https://rakatookyang.com/";
const MAX_PRODUCTS = 50;

export interface RakatookyangPageAudit {
  url: string;
  title: string;
  headings: string[];
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  inputs: Array<{ placeholder: string; name: string; type: string; ariaLabel: string }>;
  text: string;
}

export interface RakatookyangInspectResult {
  url: string;
  title: string;
  price?: number;
  originalPrice?: number;
  lowestPrice?: number;
  averagePrice?: number;
  promotion?: string;
  seller?: string;
  text: string;
}

const isHttpUrl = (value: string) => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const money = (value: string | null | undefined) => {
  if (!value) return undefined;
  const match = value.replace(/,/g, "").match(/(?:฿|บาท|THB)?\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : undefined;
};

async function findSearchInput(page: Page) {
  const fields = page.locator("input, textarea");
  const count = await fields.count();
  let best = -1;
  let bestScore = -1;

  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    const meta = [
      await field.getAttribute("placeholder"),
      await field.getAttribute("name"),
      await field.getAttribute("id"),
      await field.getAttribute("aria-label"),
      await field.getAttribute("type"),
    ].filter(Boolean).join(" ").toLowerCase();

    const type = (await field.getAttribute("type"))?.toLowerCase() ?? "";
    if (["hidden", "submit", "button", "checkbox", "radio", "file"].includes(type)) continue;

    let score = 0;
    if (/search|ค้นหา|keyword|query/.test(meta)) score += 100;
    if (/product|สินค้า/.test(meta)) score += 20;
    if (/url|link|ลิงก์/.test(meta)) score += 10;
    if (await field.isVisible().catch(() => false)) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best >= 0 ? fields.nth(best) : null;
}

async function clickSearch(page: Page, input: ReturnType<Page["locator"]>) {
  const form = input.locator("xpath=ancestor::form[1]");
  if (await form.count()) {
    const button = form.getByRole("button").first();
    if (await button.count() && await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
    await input.press("Enter");
    return;
  }

  const candidates = page.getByRole("button");
  const count = await candidates.count();
  for (let i = 0; i < count; i++) {
    const button = candidates.nth(i);
    const text = ((await button.innerText().catch(() => "")) || "").toLowerCase();
    if (/ค้นหา|search/.test(text)) {
      await button.click();
      return;
    }
  }
  await input.press("Enter");
}

async function extractProducts(page: Page): Promise<Product[]> {
  const raw = await page.evaluate(() => {
    const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
    const parseMoney = (v: string) => {
      const m = v.replace(/,/g, "").match(/(?:฿|บาท|THB)\s*(\d+(?:\.\d+)?)/i);
      return m ? Number(m[1]) : undefined;
    };
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
    const out: Array<{ name: string; url: string; price?: number; originalPrice?: number; promotion?: string }> = [];

    for (const a of anchors) {
      const href = a.href;
      const name = clean(a.innerText || a.textContent);
      if (!name || !href || !/rakatookyang\.com\/products\//i.test(href)) continue;
      const card = a.closest("article, li, [class*=card], [class*=product], [data-testid*=product]") as HTMLElement | null;
      const text = clean(card?.innerText || a.parentElement?.innerText || name);
      const prices = [...text.matchAll(/(?:฿|บาท|THB)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, "")));
      out.push({ name, url: href, price: prices[1] ?? prices[0], originalPrice: prices[0], promotion: text.slice(0, 1000) });
    }

    return out;
  });

  const unique = new Map<string, Product>();
  for (const item of raw) {
    if (unique.has(item.url)) continue;
    unique.set(item.url, {
      id: `rakatookyang-${Date.now()}-${unique.size + 1}`,
      name: item.name,
      url: item.url,
      ...(item.price !== undefined ? { price: item.price } : {}),
      ...(item.originalPrice !== undefined ? { originalPrice: item.originalPrice } : {}),
      ...(item.promotion ? { promotion: item.promotion } : {}),
      source: "rakatookyang",
      discoveredAt: new Date().toISOString(),
    });
    if (unique.size >= MAX_PRODUCTS) break;
  }
  return [...unique.values()];
}

export class RakatookyangProvider implements ProductProvider {
  readonly name = "rakatookyang";

  async search(query: string): Promise<Product[]> {
    const input = query.trim();
    if (!input) throw new Error("usage: product search rakatookyang <query-or-url>");

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();

      if (isHttpUrl(input) && /\/products\//i.test(input)) {
        await page.goto(input, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1200);
        return [await this.toProduct(page, input)];
      }

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);
      const searchInput = await findSearchInput(page);
      if (!searchInput) throw new Error(`Rakatookyang search input not found. Page: ${page.url()}`);

      await searchInput.fill(input);
      await clickSearch(page, searchInput);
      await page.waitForTimeout(1800);
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => undefined);
      await page.waitForTimeout(800);

      const products = await extractProducts(page);
      if (!products.length) {
        throw new Error(`Rakatookyang returned no product cards for query: ${input}`);
      }
      return products;
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  async inspect(url: string): Promise<RakatookyangInspectResult> {
    if (!isHttpUrl(url)) throw new Error("usage: product inspect <rakatookyang-product-url>");
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1200);
      return await this.readProductPage(page);
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  async audit(url = BASE_URL): Promise<RakatookyangPageAudit> {
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1000);
      return await page.evaluate(() => {
        const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
        return {
          url: location.href,
          title: clean(document.title),
          headings: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((x) => clean(x.textContent)).filter(Boolean),
          links: [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((x) => ({ text: clean(x.textContent), href: x.href })).filter((x) => x.text),
          buttons: [...document.querySelectorAll<HTMLButtonElement>("button")].map((x) => clean(x.textContent)).filter(Boolean),
          inputs: [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea")].map((x) => ({ placeholder: x.getAttribute("placeholder") ?? "", name: x.getAttribute("name") ?? "", type: x.getAttribute("type") ?? "", ariaLabel: x.getAttribute("aria-label") ?? "" })),
          text: clean(document.body?.innerText),
        };
      });
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  private async readProductPage(page: Page): Promise<RakatookyangInspectResult> {
    return page.evaluate(() => {
      const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
      const text = clean(document.body?.innerText);
      const title = clean(document.querySelector("h1")?.textContent || document.title);
      const prices = [...text.matchAll(/(?:฿|บาท|THB)\s*([\d,]+(?:\.\d+)?)/gi)].map((m) => Number(m[1].replace(/,/g, "")));
      const pick = (label: RegExp) => {
        const line = text.split(/\n+/).map(clean).find((x) => label.test(x));
        return line;
      };
      const avg = pick(/^เฉลี่ย/);
      const low = pick(/^ต่ำสุด/);
      const promotion = text.split(/\n+/).map(clean).filter((x) => /โค้ด|ส่วนลด|โปรโมชั่น|VIP/.test(x)).slice(0, 8).join(" | ");
      return {
        url: location.href,
        title,
        price: prices[1] ?? prices[0],
        originalPrice: prices[0],
        lowestPrice: low ? Number(low.replace(/[^\d.]/g, "")) : undefined,
        averagePrice: avg ? Number(avg.replace(/[^\d.]/g, "")) : undefined,
        promotion: promotion || undefined,
        seller: text.match(/สินค้าอื่นใน (.+?)(?:\n|$)/)?.[1],
        text,
      };
    });
  }

  private async toProduct(page: Page, url: string): Promise<Product> {
    const detail = await this.readProductPage(page);
    return {
      id: `rakatookyang-${Date.now()}`,
      name: detail.title,
      url,
      ...(detail.price !== undefined ? { price: detail.price } : {}),
      ...(detail.originalPrice !== undefined ? { originalPrice: detail.originalPrice } : {}),
      ...(detail.lowestPrice !== undefined ? { lowestPrice: detail.lowestPrice } : {}),
      ...(detail.averagePrice !== undefined ? { averagePrice: detail.averagePrice } : {}),
      ...(detail.promotion ? { promotion: detail.promotion } : {}),
      ...(detail.seller ? { seller: detail.seller } : {}),
      source: "rakatookyang",
      discoveredAt: new Date().toISOString(),
    };
  }
}

export { money };
