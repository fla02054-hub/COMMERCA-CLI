import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProduct, rankProducts } from "../src/product/index.js";

test("product analysis produces a deterministic score and factors", () => {
  const result = analyzeProduct({ id: "p1", name: "Test Product", price: 250, commission: 100, salesCount: 10000, rating: 4.9, reviewCount: 1200, discount: 50, promotion: "sale", url: "https://example.invalid/p1", source: "fixture", discoveredAt: new Date().toISOString() });
  assert.equal(result.score, 88);
  assert.equal(result.factors.price, 15);
  assert.equal(result.factors.commission, 20);
  assert.equal(result.factors.demand, 20);
  assert.equal(result.factors.socialProof, 15);
  assert.equal(result.factors.promotion, 10);
  assert.equal(result.factors.contentPotential, 8);
  assert.ok(result.reasons.length > 0);
});

test("ranking orders products by analysis score", () => {
  const results = rankProducts([
    { id: "low", name: "Low", price: 2000, commission: 10, source: "fixture", discoveredAt: new Date().toISOString() },
    { id: "high", name: "High", price: 200, commission: 100, salesCount: 10000, rating: 4.9, reviewCount: 1000, discount: 50, promotion: "sale", source: "fixture", discoveredAt: new Date().toISOString() },
  ]);
  assert.equal(results[0]?.product.id, "high");
});
