import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";
import { BrowserController } from "../../browser/controller.js";

export interface ShopeeSearchOptions {
  market?: "th";
  browserPort?: number;
  waitMs?: number;
}

export class ShopeeProvider implements ProductProvider {
  readonly name = "shopee";
  private readonly options: ShopeeSearchOptions;

  constructor(options: ShopeeSearchOptions = {}) {
    this.options = options;
  }

  async search(query: string): Promise<Product[]> {
    const browser = new BrowserController({ port: this.options.browserPort ?? 9222 });
    const encoded = encodeURIComponent(query.trim());
    await browser.open(`https://shopee.co.th/search?keyword=${encoded}`);
    await browser.wait(this.options.waitMs ?? 2500);

    const rows = await browser.evaluate<Array<Record<string, unknown>>>(`(() => {
      const absolute = (value) => {
        try { return new URL(value, location.href).href; } catch { return undefined; }
      };
      const text = (node) => (node?.textContent || '').replace(/\\s+/g, ' ').trim();
      const cards = [...document.querySelectorAll('a[href*="-i."]')];
      const seen = new Set();
      return cards.map((card) => {
        const url = absolute(card.getAttribute('href') || '');
        if (!url || seen.has(url)) return null;
        seen.add(url);
        const image = card.querySelector('img');
        const name = text(card.querySelector('[class*="line-clamp"], [class*="name"], div'));
        const priceText = text(card.querySelector('[class*="price"], span'));
        const numbers = priceText.match(/[0-9][0-9,.]*/g) || [];
        const prices = numbers.map((v) => Number(v.replace(/,/g, ''))).filter(Number.isFinite);
        const alt = image?.getAttribute('alt') || '';
        return {
          url,
          name: name || alt,
          image: image?.getAttribute('src') || image?.getAttribute('data-src') || undefined,
          price: prices.length ? Math.min(...prices) : undefined,
          rawPrice: priceText,
        };
      }).filter(Boolean).slice(0, 20);
    })()`);

    browser.close();
    return rows
      .filter((row) => typeof row.url === "string" && typeof row.name === "string" && row.name.length > 0)
      .map((row, index) => ({
        id: `shopee-browser-${Date.now()}-${index}`,
        name: String(row.name),
        url: String(row.url),
        price: typeof row.price === "number" ? row.price : undefined,
        source: "shopee-browser",
        discoveredAt: new Date().toISOString(),
      }));
  }
}
