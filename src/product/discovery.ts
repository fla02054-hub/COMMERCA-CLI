import type { Product } from "./types.js";

export interface ProductDiscovery {
  search(query: string): Promise<Product[]>;
}
