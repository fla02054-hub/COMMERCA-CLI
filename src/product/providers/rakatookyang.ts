import { chromium, type Browser } from "playwright";
import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

const BASE_URL = "https://rakatookyang.com/";
const MAX_PRODUCTS = 50;

interface BrowserProduct {
  title: string;
  url: string;
  price?: number;
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

      const result = await page.evaluate((query) => {
        const fields = Array.from(
          document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
        ).filter((el) => {
          const type = el instanceof HTMLInputElement ? el.type : "";
          return type !== "hidden" && type !== "submit" && type !== "button" && type !== "checkbox" && type !== "radio";
        });

        const score = (el: HTMLInputElement | HTMLTextAreaElement) => {
          const meta = `${el.placeholder ?? ""} ${el.name ?? ""} ${el.id ?? ""} ${el.getAttribute("aria-label") ?? ""} ${el.getAttribute("type") ?? ""}`.toLowerCase();
          let value = 0;
          if (/url|link|ลิงก์|สินค้า|product/.test(meta)) value += 10;
          if (/search|ค้นหา|keyword|query|price|ราคา/.test(meta)) value += 8;
          if (/text|url|search/.test(meta)) value += 3;
          return value;
        };

        const input = [...fields].sort((a, b) => score(b) - score(a))[0];
        if (!input) return { ok: false, error: "Rakatookyang search input was not found." };

        input.focus();
        input.value = query;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        const form = input.closest("form");
        if (form) {
          if (typeof form.requestSubmit === "function") form.requestSubmit();
          else form.submit();
        } else {
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
          input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        }

        return { ok: true };
      }, input);

      if (!result.ok) throw new Error(result.error);

      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

      const products = await page.evaluate(() => {
        return [...document.querySelectorAll("a")].map((a) => ({
          title: a.textContent?.trim() ?? "",
          url: (a as HTMLAnchorElement).href,
        })).filter((item) => item.title && item.url);
      });

      const usable = products.slice(0, MAX_PRODUCTS);
      if (!usable.length) {
        throw new Error(`Rakatookyang returned no products. URL: ${page.url()}`);
      }

      return usable.map((item, index) => ({
        id: `rakatookyang-${Date.now()}-${index + 1}`,
        name: item.title,
        ...(item.url ? { url: item.url } : {}),
        source: "rakatookyang",
        discoveredAt: new Date().toISOString(),
      }));
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
}
