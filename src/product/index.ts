export type { Product } from "./types.js";
export type { ProductDiscovery } from "./discovery.js";

export { LocalProductDiscovery } from "./local-discovery.js";

export type { ProductProvider } from "./providers/index.js";
export { ShopeeProvider } from "./providers/index.js";

export { ProductProviderRegistry } from "./registry.js";

export {
  analyzeProduct,
  type ProductAnalysis,
} from "./analysis.js";

export {
  rankProducts,
  selectBestProduct,
} from "./selection.js";
