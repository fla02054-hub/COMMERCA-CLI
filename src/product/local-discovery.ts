import type { Product } from "./types.js";
import type { ProductDiscovery } from "./discovery.js";
import { ShopeeBrowserProvider } from "./providers/shopee-browser.js";

export interface LocalProductDiscoveryOptions {
  extensionTimeoutMs?: number;
  extensionPort?: number;
  detailLimit?: number;
}

export class LocalProductDiscovery implements ProductDiscovery {
  private readonly options: LocalProductDiscoveryOptions;

  constructor(options: LocalProductDiscoveryOptions = {}) {
    this.options = options;
  }

  async search(query: string): Promise<Product[]> {
    const provider = new ShopeeBrowserProvider({
      timeoutMs: this.options.extensionTimeoutMs ?? 30000,
      port: this.options.extensionPort ?? 8765,
    });
    return provider.search(query);
  }
}
