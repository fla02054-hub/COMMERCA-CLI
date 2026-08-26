import type { Product } from "../types.js";
import { BrowserController } from "../../browser/controller.js";
import type { ProductProvider } from "./provider.js";

export interface ShopeeBrowserProviderOptions {
  browser?: BrowserController;
  searchUrl?: string;
}

export class ShopeeBrowserProvider implements ProductProvider {
  readonly name = "shopee-browser";
  private readonly browser: BrowserController;
  private readonly searchUrl: string;

  constructor(options: ShopeeBrowserProviderOptions = {}) {
    this.browser = options.browser ?? new BrowserController();
    this.searchUrl = options.searchUrl ?? "https://shopee.co.th/search?keyword=";
  }

  async search(query: string): Promise<Product[]> {
    await this.browser.open(`${this.searchUrl}${encodeURIComponent(query)}`);
    return this.browser.evaluate<Product[]>(() => {
      const text = (node: Element | null) => node?.textContent?.trim() ?? "";
      const links = [...document.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]')];
      const seen = new Set<string>();
      return links.flatMap((link, index) => {
        const href = link.href;
        if (!href || seen.has(href)) return [];
        seen.add(href);
        const card = link.closest("div") ?? link;
        const name = text(card.querySelector("[class*=name], [class*=Name]")) || text(link);
        const priceText = text(card.querySelector("[class*=price], [class*=Price]"));
        const price = Number(priceText.replace(/[^0-9.]/g, "")) || undefined;
        return [{
          id: `shopee-browser-${index}-${btoa(unescape(encodeURIComponent(href))).slice(0, 16)}`,
          name: name || `Shopee product ${index + 1}`,
          url: href,
          price,
          source: "shopee-browser",
          discoveredAt: new Date().toISOString(),
        } satisfies Product];
      });
    });
  }
}
