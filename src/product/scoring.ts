import type { Product } from "./types.js";
import type { ProductAnalysis } from "./analysis.js";

export interface ProductScorecard {
  productId: string;
  score: number;
  grade: "A" | "B" | "C" | "D";
  factors: ProductAnalysis["factors"];
  reasons: string[];
}

export function scoreProduct(analysis: ProductAnalysis): ProductScorecard {
  return {
    productId: analysis.product.id,
    score: analysis.score,
    grade: gradeFor(analysis.score),
    factors: analysis.factors,
    reasons: analysis.reasons,
  };
}

export function scoreProducts(analyses: ProductAnalysis[]): ProductScorecard[] {
  return analyses.map(scoreProduct).sort((a, b) => b.score - a.score);
}

function gradeFor(score: number): ProductScorecard["grade"] {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  return "D";
}
