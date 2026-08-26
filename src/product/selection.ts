import type { Product } from "./types.js";
import { analyzeProduct, type ProductAnalysis } from "./analysis.js";

export function rankProducts(products: Product[]): ProductAnalysis[] {
  return products
    .map(analyzeProduct)
    .sort((a, b) => b.score - a.score);
}

export function selectBestProduct(
  products: Product[],
): ProductAnalysis | undefined {
  return rankProducts(products)[0];
}
