import type { Product } from "../types.js";
import { BrowserController } from "../../browser/controller.js";
import type { ProductProvider } from "./provider.js";

export interface ShopeeBrowserProviderOptions {
  browser?: BrowserController;
  homeUrl?: string;
  extensionTimeoutMs?: number;
}

interface ExtensionSearchResponse {
  url: string;
  products: Array<{ name: string; price?: number; url: string; source?: string }>;
}

export class ShopeeBrowserProvider implements ProductProvider {
  readonly name = "shopee-browser";
  private readonly browser: BrowserController;
  private readonly homeUrl: string;
  private readonly extensionTimeoutMs: number;

  constructor(options: ShopeeBrowserProviderOptions = {}) {
    this.browser = options.browser ?? new BrowserController();
    this.homeUrl = options.homeUrl ?? "https://shopee.co.th/";
    this.extensionTimeoutMs = options.extensionTimeoutMs ?? 20000;
  }

  async search(query: string): Promise<Product[]> {
    // The Extension drives the real Shopee page. No Shopee API is used.
    await this.browser.open(this.homeUrl);
    await this.browser.wait(2500);

    const response = await this.browser.evaluate<ExtensionSearchResponse>(`(() => {
      const requestId = 'search-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          window.removeEventListener('message', onMessage);
          reject(new Error('COMMERCA Shopee Extension ไม่ตอบกลับภายใน ${this.extensionTimeoutMs}ms — ตรวจว่าโหลด Extension แล้ว'));
        }, ${this.extensionTimeoutMs});
        const onMessage = (event) => {
          if (event.source !== window) return;
          if (event.data?.source !== 'COMMERCA_EXTENSION') return;
          if (event.data?.requestId !== requestId) return;
          clearTimeout(timeout);
          window.removeEventListener('message', onMessage);
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.result);
        };
        window.addEventListener('message', onMessage);
        window.postMessage({ source: 'COMMERCA_CLI', requestId, type: 'SEARCH', query: ${JSON.stringify(query)} }, '*');
      });
    })()`);

    return response.products.map((product, index) => ({
      id: `shopee-extension-${index + 1}`,
      name: product.name || `Shopee product ${index + 1}`,
      url: product.url,
      price: product.price,
      source: "shopee-browser",
      discoveredAt: new Date().toISOString(),
    } satisfies Product));
  }
}
