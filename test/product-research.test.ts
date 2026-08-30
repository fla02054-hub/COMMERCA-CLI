import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../src/product/types.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";

const product: Product = { id: "p1", name: "Fixture Product", image: "fixture://p1", url: "https://example.invalid/p1", price: 299, source: "fixture", discoveredAt: new Date().toISOString() };
const context = (artifacts: any[], stage: "product-input" | "product-research") => ({ workflowId: "test-workflow", goal: "test", stage, artifacts });

test("product research enriches the manually supplied product through the injected researcher", async () => {
  const registry = createStageRegistry({
    product,
    researchProduct: async (item) => ({ ...item, price: 199, originalPrice: 399, discount: 50, commission: 70, rating: 4.8, reviewCount: 1200, salesCount: 9000, promotion: "coupon" }),
  });
  const input = await registry.get("product-input").execute(context([], "product-input"));
  const research = await registry.get("product-research").execute(context(input.artifacts, "product-research"));
  const data = research.artifacts[0]?.data as { products: Product[]; researchErrors: unknown[] };
  assert.equal(data.products[0]?.price, 199);
  assert.equal(data.products[0]?.commission, 70);
  assert.equal(data.products[0]?.rating, 4.8);
  assert.equal(data.researchErrors.length, 0);
});

test("product research preserves the manually supplied product when enrichment fails", async () => {
  const registry = createStageRegistry({ product, researchProduct: async () => { throw new Error("detail unavailable"); } });
  const input = await registry.get("product-input").execute(context([], "product-input"));
  const result = await registry.get("product-research").execute(context(input.artifacts, "product-research"));
  const data = result.artifacts[0]?.data as { products: Product[]; researchErrors: Array<{ productId: string; error: string }> };
  assert.equal(data.products[0]?.id, "p1");
  assert.equal(data.researchErrors[0]?.productId, "p1");
  assert.equal(data.researchErrors[0]?.error, "detail unavailable");
});
