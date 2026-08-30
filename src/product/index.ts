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
  type ProductAnalysis,
} from "./analysis.js";

export {
  rankProducts,
  selectBestProduct,
} from "./selection.js";

export {
  scoreProduct,
  scoreProducts,
  type ProductScorecard,
} from "./scoring.js";
