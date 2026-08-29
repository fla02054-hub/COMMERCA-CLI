import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../src/product/types.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";

const product: Product = { id: "p1", name: "Fixture Product", url: "https://example.invalid/p1", source: "fixture", discoveredAt: new Date().toISOString() };

test("product research enriches candidates through the injected researcher", async () => {
  const registry = createStageRegistry({
    discoverProducts: async () => [product],
    researchProduct: async (item) => ({ ...item, price: 199, originalPrice: 399, discount: 50, commission: 70, rating: 4.8, reviewCount: 1200, salesCount: 9000, promotion: "coupon" }),
  });
  const stage = registry.get("product-research");
  assert.ok(stage);
  const discovery = await registry.get("product-discovery")!.run({ goal: "test", artifacts: [] });
  const research = await stage.run({ goal: "test", artifacts: discovery.artifacts });
  const data = research.artifacts[0]?.data as { products: Product[]; researchErrors: unknown[] };
  assert.equal(data.products[0]?.price, 199);
  assert.equal(data.products[0]?.commission, 70);
  assert.equal(data.products[0]?.rating, 4.8);
  assert.equal(data.researchErrors.length, 0);
});

test("product research preserves the candidate when a provider detail lookup fails", async () => {
  const registry = createStageRegistry({
    researchProduct: async () => { throw new Error("detail unavailable"); },
  });
  const stage = registry.get("product-research")!;
  const result = await stage.run({ goal: "test", artifacts: [{ stage: "product-discovery", type: "product-candidate-list", data: [product], createdAt: new Date().toISOString() }] });
  const data = result.artifacts[0]?.data as { products: Product[]; researchErrors: Array<{ productId: string; error: string }> };
  assert.equal(data.products[0]?.id, "p1");
  assert.equal(data.researchErrors[0]?.productId, "p1");
  assert.equal(data.researchErrors[0]?.error, "detail unavailable");
});
