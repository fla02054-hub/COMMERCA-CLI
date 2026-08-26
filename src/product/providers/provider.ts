import type { Product } from "../types.js";

export interface ProductProvider {
  readonly name: string;
  search(query: string): Promise<Product[]>;
}
