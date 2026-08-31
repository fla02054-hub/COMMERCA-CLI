export type { Product } from "./types.js";

export {
  readShopeeProductDetail,
  type ShopeeProductDetail,
} from "./shopee-detail.js";

export {
  readRakatookyangPriceHistory,
  type RakatookyangPriceResult,
} from "./rakatookyang-price.js";

export {
  analyzeProduct,
  rankProducts,
  type ProductAnalysis,
} from "./analysis.js";

export {
  scoreProduct,
  scoreProducts,
  type ProductScorecard,
} from "./scoring.js";
