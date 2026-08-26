import type { Product } from "./types.js";

export interface ProductAnalysis {
  product: Product;
  score: number;
  factors: {
    price: number;
    commission: number;
    demand: number;
    socialProof: number;
    promotion: number;
    contentPotential: number;
  };
  reasons: string[];
}

export function analyzeProduct(product: Product): ProductAnalysis {
  const factors = {
    price: scorePrice(product),
    commission: scoreCommission(product),
    demand: scoreDemand(product),
    socialProof: scoreSocialProof(product),
    promotion: scorePromotion(product),
    contentPotential: scoreContentPotential(product),
  };

  const score =
    factors.price +
    factors.commission +
    factors.demand +
    factors.socialProof +
    factors.promotion +
    factors.contentPotential;

  return {
    product,
    score,
    factors,
    reasons: buildReasons(product, factors),
  };
}

function scorePrice(product: Product): number {
  if (product.price === undefined) return 0;
  if (product.price <= 300) return 15;
  if (product.price <= 700) return 12;
  if (product.price <= 1500) return 8;
  return 4;
}

function scoreCommission(product: Product): number {
  if (product.commission === undefined) return 0;
  if (product.commission >= 100) return 20;
  if (product.commission >= 60) return 15;
  if (product.commission >= 30) return 10;
  return 5;
}

function scoreDemand(product: Product): number {
  if (product.salesCount === undefined) return 0;
  if (product.salesCount >= 10000) return 20;
  if (product.salesCount >= 5000) return 15;
  if (product.salesCount >= 1000) return 10;
  return 5;
}

function scoreSocialProof(product: Product): number {
  if (product.rating === undefined || product.reviewCount === undefined) {
    return 0;
  }

  if (product.rating >= 4.8 && product.reviewCount >= 1000) return 15;
  if (product.rating >= 4.5 && product.reviewCount >= 500) return 12;
  if (product.rating >= 4.0) return 8;
  return 3;
}

function scorePromotion(product: Product): number {
  if (product.discount === undefined) return 0;
  if (product.discount >= 50) return 10;
  if (product.discount >= 30) return 8;
  if (product.discount >= 15) return 5;
  return 2;
}

function scoreContentPotential(product: Product): number {
  let score = 0;

  if (product.name) score += 3;
  if (product.promotion) score += 3;
  if (product.url) score += 2;
  if (product.originalPrice !== undefined) score += 2;

  return score;
}

function buildReasons(
  product: Product,
  factors: ProductAnalysis["factors"],
): string[] {
  const reasons: string[] = [];

  if (factors.price >= 12) reasons.push("attractive price range");
  if (factors.commission >= 15) reasons.push("strong commission");
  if (factors.demand >= 15) reasons.push("strong sales demand");
  if (factors.socialProof >= 12) reasons.push("strong social proof");
  if (factors.promotion >= 8) reasons.push("strong promotion");
  if (factors.contentPotential >= 7) {
    reasons.push("good content potential");
  }

  if (reasons.length === 0) {
    reasons.push("insufficient product data");
  }

  return reasons;
}
