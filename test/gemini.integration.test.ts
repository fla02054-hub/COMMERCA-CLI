import assert from "node:assert/strict";
import test from "node:test";
import { generateContentWithGemini } from "../src/ai/gemini.js";
import type { ProductAnalysis } from "../src/product/analysis.js";

const apiKey = process.env.GEMINI_API_KEY;

test("Gemini real API returns a valid COMMERCA content package", { skip: !apiKey }, async () => {
  const product = {
    id: "gemini-integration-1", name: "COMMERCA Gemini Test Product",
    url: "https://example.invalid/product/1", price: 299, originalPrice: 599,
    discount: 50, commission: 100, rating: 4.9, reviewCount: 1500,
    salesCount: 12000, promotion: "Test promotion", source: "integration-test",
    discoveredAt: new Date().toISOString(),
  };
  const analysis = {
    product, reasons: ["high rating", "strong sales"], score: 90,
  } as ProductAnalysis;
  const result = await generateContentWithGemini(analysis);
  assert.equal(typeof result.title, "string");
  assert.ok(result.title.trim());
  assert.equal(typeof result.hook, "string");
  assert.ok(result.hook.trim());
  assert.equal(typeof result.body, "string");
  assert.ok(result.body.trim());
  assert.equal(typeof result.callToAction, "string");
  assert.ok(result.callToAction.trim());
});
