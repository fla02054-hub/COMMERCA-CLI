import type { Product } from "./types.js";
import type { ProductDiscovery } from "./discovery.js";

export class LocalProductDiscovery implements ProductDiscovery {
  async search(_query: string): Promise<Product[]> {
    return [];
  }
}
