import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "../src/product/types.js";
import type { ProductProvider } from "../src/product/providers/provider.js";
import { ProductProviderRegistry } from "../src/product/registry.js";

const product = (id: string, source: string): Product => ({
  id,
  name: `Fixture ${id}`,
  url: `https://example.invalid/${id}`,
  source,
  discoveredAt: new Date().toISOString(),
});

class FixtureProvider implements ProductProvider {
  constructor(readonly name: string, private readonly result: Product[]) {}
  async search(): Promise<Product[]> { return this.result; }
}

test("provider registry searches all configured providers and preserves provider errors", async () => {
  const registry = new ProductProviderRegistry();
  registry.register(new FixtureProvider("provider-a", [product("a", "provider-a")]));
  registry.register(new FixtureProvider("provider-b", [product("b", "provider-b")]));

  const results = await registry.searchAll("test");
  assert.deepEqual(results.map((item) => item.provider), ["provider-a", "provider-b"]);
  assert.equal(results[0]?.products[0]?.id, "a");
  assert.equal(results[1]?.products[0]?.id, "b");
});

test("provider registry isolates one provider failure", async () => {
  const registry = new ProductProviderRegistry();
  registry.register(new FixtureProvider("healthy", [product("ok", "healthy")]));
  registry.register({
    name: "broken",
    async search(): Promise<Product[]> { throw new Error("provider unavailable"); },
  });

  const results = await registry.searchAll("test");
  const broken = results.find((item) => item.provider === "broken");
  const healthy = results.find((item) => item.provider === "healthy");
  assert.equal(broken?.products.length, 0);
  assert.equal(broken?.error, "provider unavailable");
  assert.equal(healthy?.products[0]?.id, "ok");
});
