import { chromium } from "playwright";
import { RakatookyangProvider as LegacyRakatookyangProvider } from "./rakatookyang.js";
import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

const BASE_URL = "https://rakatookyang.com/";
const MAX_PRODUCTS = 50;

async function findSearchInput(page: import("playwright").Page) {
  const fields = page.locator("input, textarea");
  let best = -1;
  let scoreBest = -1;
  for (let i = 0; i < await fields.count(); i++) {
    const field = fields.nth(i);
    const meta = ["placeholder", "name", "id", "aria-label", "type"]
      .map((name) => field.getAttribute(name))
      .length;
    void meta;
    const text = [
      await field.getAttribute("placeholder"),
      await field.getAttribute("name"),
      await field.getAttribute("id"),
      await field.getAttribute("aria-label"),
    ].filter(Boolean).join(" ").toLowerCase();
    const type = (await field.getAttribute("type"))?.toLowerCase() ?? "";
    if (["hidden", "submit", "button", "checkbox", "radio", "file"].includes(type)) continue;
    let score = 0;
    if (/search|ค้นหา|keyword|query/.test(text)) score += 100;
    if (/product|สินค้า/.test(text)) score += 20;
    if (await field.isVisible().catch(() => false)) score += 5;
    if (score > scoreBest) { scoreBest = score; best = i; }
  }
  return best >= 0 ? fields.nth(best) : null;
}

async function clickSearch(page: import("playwright").Page, input: import("playwright").Locator) {
  const form = input.locator("xpath=ancestor::form[1]");
  if (await form.count()) {
    const button = form.getByRole("button").first();
    if (await button.count() && await button.isVisible().catch(() => false)) return button.click();
    return input.press("Enter");
  }
  for (let i = 0, n = await page.getByRole("button").count(); i < n; i++) {
    const button = page.getByRole("button").nth(i);
    if (/ค้นหา|search/i.test((await button.innerText().catch(() => "")).trim())) return button.click();
  }
  return input.press("Enter");
}

export class RakatookyangBrowserProvider implements ProductProvider {
  readonly name = "rakatookyang";
  private readonly legacy = new LegacyRakatookyangProvider();

  async search(query: string): Promise<Product[]> {
    const q = query.trim();
    if (!q) throw new Error("usage: product search rakatookyang <query-or-url>");
    const browser = await chromium.launch({ headless: false });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);
      const input = await findSearchInput(page);
      if (!input) throw new Error(`Rakatookyang search input not found. Page: ${page.url()}`);
      await input.fill(q);
      await clickSearch(page, input);
      await page.waitForTimeout(1800);
      await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => undefined);

      const links = page.locator('a[href*="/products/"]');
      const products: Product[] = [];
      const seen = new Set<string>();
      for (let i = 0, n = await links.count(); i < n && products.length < MAX_PRODUCTS; i++) {
        const link = links.nth(i);
        const href = await link.getAttribute("href");
        if (!href) continue;
        const url = new URL(href, page.url()).href;
        if (seen.has(url)) continue;
        const name = ((await link.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim();
        if (!name) continue;
        seen.add(url);
        products.push({
          id: `rakatookyang-${Date.now()}-${products.length + 1}`,
          name,
          url,
          source: "rakatookyang",
          discoveredAt: new Date().toISOString(),
        });
      }
      if (!products.length) throw new Error(`Rakatookyang returned no product cards for query: ${q}`);
      return products;
    } finally {
      await browser.close().catch(() => undefined);
    }
  }

  async openSearch(query: string): Promise<void> {
    const q = query.trim();
    if (!q) throw new Error("usage: product open-search <query>");
    const browser = await chromium.launch({ headless: false });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(800);
      const input = await findSearchInput(page);
      if (!input) throw new Error(`Rakatookyang search input not found. Page: ${page.url()}`);
      await input.fill(q);
      await clickSearch(page, input);
      await page.waitForTimeout(1800);
      console.log(`RakaTookYang search opened: ${page.url()}`);
      console.log(`Query: ${q}`);
      console.log("Browser remains open. Close it manually when finished.");
      await new Promise(() => undefined);
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  }

  inspect(url: string) { return this.legacy.inspect(url); }
  audit(url?: string) { return this.legacy.audit(url); }
}
