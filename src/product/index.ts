export type { Product } from "./types.js";
export type { ProductDiscovery } from "./discovery.js";

export {
  LocalProductDiscovery,
  type LocalProductDiscoveryOptions,
} from "./local-discovery.js";

export type { ProductProvider } from "./providers/index.js";
export {
  ShopeeProvider,
  ShopeeBrowserProvider,
  type ShopeeSearchOptions,
} from "./providers/index.js";

export {
  readShopeeProductDetail,
  type ShopeeProductDetail,
} from "./shopee-detail.js";

export { ProductProviderRegistry } from "./registry.js";

export {
  analyzeProduct,
  type ProductAnalysis,
} from "./analysis.js";

export {
  rankProducts,
  selectBestProduct,
} from "./selection.js";
