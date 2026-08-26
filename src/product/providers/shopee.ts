import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

export class ShopeeProvider implements ProductProvider {
  readonly name = "shopee";

  async search(_query: string) {
    throw new Error(
      "Shopee provider is not configured. Add the official Shopee integration before searching."
    );
  }
}
