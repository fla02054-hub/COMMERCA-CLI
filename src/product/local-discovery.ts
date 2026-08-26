import type { Product } from "./types.js";
import type { ProductDiscovery } from "./discovery.js";
import { ShopeeProvider } from "./providers/shopee.js";
import { readShopeeProductDetail } from "./shopee-detail.js";

export interface LocalProductDiscoveryOptions {
  browserPort?: number;
  searchWaitMs?: number;
  detailWaitMs?: number;
  detailLimit?: number;
}

export class LocalProductDiscovery implements ProductDiscovery {
  private readonly options: LocalProductDiscoveryOptions;

  constructor(options: LocalProductDiscoveryOptions = {}) {
    this.options = options;
  }

  async search(query: string): Promise<Product[]> {
    const provider = new ShopeeProvider({
      market: "th",
      browserPort: this.options.browserPort ?? 9222,
      waitMs: this.options.searchWaitMs ?? 3000,
    });

    const results = await provider.search(query);
    const limit = Math.min(this.options.detailLimit ?? 10, results.length);
    const enriched: Product[] = [];

    for (const product of results.slice(0, limit)) {
      if (!product.url) {
        enriched.push(product);
        continue;
      }

      try {
        enriched.push(await readShopeeProductDetail(product.url, {
          browserPort: this.options.browserPort ?? 9222,
          waitMs: this.options.detailWaitMs ?? 3000,
        }));
      } catch (error) {
        console.warn(`Warning: could not read Shopee detail: ${String(error)}`);
        enriched.push(product);
      }
    }

    return enriched;
  }
}
