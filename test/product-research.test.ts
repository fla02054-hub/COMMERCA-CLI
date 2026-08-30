import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../src/product/types.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";

const product: Product = { id: "p1", name: "Fixture Product", image: "fixture://p1", url: "https://example.invalid/p1", price: 299, source: "fixture", discoveredAt: new Date().toISOString() };
const context = (artifacts: any[], stage: "product-input") => ({ workflowId: "test-workflow", goal: "test", stage, artifacts });

test("direct-product workflow accepts the manually supplied product", async () => {
  const registry = createStageRegistry({ product });
  const input = await registry.get("product-input").execute(context([], "product-input"));
  const data = input.artifacts[0]?.data as Product;
  assert.equal(data.id, "p1");
  assert.equal(data.name, "Fixture Product");
  assert.equal(data.price, 299);
  assert.equal(data.url, "https://example.invalid/p1");
});

test("direct-product workflow preserves the supplied product image", async () => {
  const registry = createStageRegistry({ product });
  const input = await registry.get("product-input").execute(context([], "product-input"));
  const data = input.artifacts[0]?.data as Product & { images?: string[] };
  assert.equal(data.image, "fixture://p1");
  assert.deepEqual(data.images, ["fixture://p1"]);
});
