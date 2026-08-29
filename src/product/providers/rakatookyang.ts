import { chromium, type Browser } from "playwright";
import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

const BASE_URL = "https://rakatookyang.com/";
const MAX_PRODUCTS = 50;

interface ExtractedProduct {
  title: string;
  url: string;
  price?: number;
  originalPrice?: number;
}

const toNumber = (value: string): number | undefined => {
  const match = value.replace(/,/g, "").match(/(?:฿|บาท|THB)\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : undefined;
};

export class RakatookyangProvider implements ProductProvider {
  readonly name = "rakatookyang";

  async search(query: string): Promise<Product[]> {
    const productUrl = query.trim();
    if (!productUrl) throw new Error("usage: product search <url>");

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();

      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1000);

      const inputInfo = await page.evaluate(() => {
        const fields = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
          .filter((el) => {
            const type = el instanceof HTMLInputElement ? el.type.toLowerCase() : "";
            return !["hidden", "submit", "button", "checkbox", "radio", "file"].includes(type);
          });

        const score = (el: HTMLInputElement | HTMLTextAreaElement) => {
          const meta = [el.placeholder, el.name, el.id, el.getAttribute("aria-label"), el.getAttribute("type")]
            .filter(Boolean).join(" ").toLowerCase();
          let score = 0;
          if (/url|link|ลิงก์|สินค้า|product/.test(meta)) score += 20;
          if (/search|ค้นหา|keyword|query/.test(meta)) score += 10;
          return score;
        };

        const input = fields.sort((a, b) => score(b) - score(a))[0];
        if (!input) return { found: false };

        return {
          found: true,
          selector: input.tagName.toLowerCase() === "textarea" ? "textarea" : "input",
        };
      });

      if (!inputInfo.found) {
        throw new Error(`Rakatookyang search input not found. Page: ${page.url()}`);
      }

      const input = page.locator(inputInfo.selector).first();
      await input.fill(productUrl);

      const form = input.locator("xpath=ancestor::form[1]");
      if (await form.count()) {
        const button = form.getByRole("button").first();
        if (await button.count()) await button.click();
        else await input.press("Enter");
      } else {
        const buttons = page.getByRole("button");
        if (await buttons.count()) {
          await buttons.first().click();
        } else {
          await input.press("Enter");
        }
      }

      await page.waitForTimeout(2500);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(1000);

      const extracted = await page.evaluate(() => {
        const clean = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
        const links = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")];
        const items: ExtractedProduct[] = [];

        for (const link of links) {
          const title = clean(link.textContent);
          const url = link.href;
          if (!title || !url || url === location.href) continue;
          if (url.startsWith("javascript:") || url.startsWith("mailto:")) continue;
          items.push({ title, url });
        }

        const body = clean(document.body?.innerText);
        const prices = [...body.matchAll(/(?:฿|บาท|THB)\s*([\d,]+(?:\.\d+)?)/gi)]
          .map((match) => Number(match[1].replace(/,/g, "")))
          .filter(Number.isFinite);

        return {
          url: location.href,
          title: clean(document.title),
          body,
          products: items,
          prices,
        };
      });

      const unique = new Map<string, ExtractedProduct>();
      for (const item of extracted.products) {
        if (!unique.has(item.url)) unique.set(item.url, item);
      }

      const usable = [...unique.values()].slice(0, MAX_PRODUCTS);
      if (usable.length) {
        return usable.map((item, index) => ({
          id: `rakatookyang-${Date.now()}-${index + 1}`,
          name: item.title,
          url: item.url,
          price: item.price,
          originalPrice: item.originalPrice,
          source: "rakatookyang",
          discoveredAt: new Date().toISOString(),
        }));
      }

      const fallbackName = extracted.title && !/rakatookyang/i.test(extracted.title)
        ? extracted.title
        : "Rakatookyang price result";
      const price = extracted.prices[0];

      return [{
        id: `rakatookyang-${Date.now()}`,
        name: fallbackName,
        url: productUrl,
        ...(price !== undefined ? { price } : {}),
        promotion: extracted.body.slice(0, 2000),
        source: "rakatookyang",
        discoveredAt: new Date().toISOString(),
      }];
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}
