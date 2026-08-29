import assert from "node:assert/strict";
import test from "node:test";
import { analyzeProduct, scoreProduct, scoreProducts } from "../src/product/index.js";

test("product scoring creates an explicit grade from analysis", () => {
  const analysis = analyzeProduct({ id: "p1", name: "Strong", price: 250, commission: 100, salesCount: 10000, rating: 4.9, reviewCount: 1200, discount: 50, promotion: "sale", url: "https://example.invalid/p1", source: "fixture", discoveredAt: new Date().toISOString() });
  const scorecard = scoreProduct(analysis);
  assert.equal(scorecard.productId, "p1");
  assert.equal(scorecard.score, 88);
  assert.equal(scorecard.grade, "A");
  assert.equal(scorecard.factors.commission, 20);
});

test("product scoring preserves descending order", () => {
  const strong = analyzeProduct({ id: "strong", name: "Strong", price: 250, commission: 100, salesCount: 10000, rating: 4.9, reviewCount: 1200, discount: 50, promotion: "sale", url: "https://example.invalid/strong", source: "fixture", discoveredAt: new Date().toISOString() });
  const weak = analyzeProduct({ id: "weak", name: "Weak", price: 2000, commission: 10, source: "fixture", discoveredAt: new Date().toISOString() });
  const scores = scoreProducts([weak, strong]);
  assert.deepEqual(scores.map((item) => item.productId), ["strong", "weak"]);
});
