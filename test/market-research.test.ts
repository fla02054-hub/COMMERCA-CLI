import assert from "node:assert/strict";
import test from "node:test";
import { MarketResearchRegistry } from "../src/market/registry.js";
import type { MarketEvidence, MarketResearchProvider } from "../src/market/types.js";

const evidence: MarketEvidence = {
  productId: "p1",
  demand: { score: 80, evidence: ["search volume"] },
  trend: { direction: "up", evidence: ["rising"] },
  competitor: { count: 12, evidence: ["competitor scan"] },
  ads: { count: 5, evidence: ["ad evidence"] },
  source: "fixture",
};

test("market registry aggregates evidence from registered providers", async () => {
  const registry = new MarketResearchRegistry();
  const provider: MarketResearchProvider = { name: "fixture", async research() { return evidence; } };
  registry.register(provider);
  const result = await registry.research({ productId: "p1", productName: "Lamp", query: "lamp" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], evidence);
});

test("market registry supports provider failure without hiding successful providers", async () => {
  const registry = new MarketResearchRegistry();
  registry.register({ name: "good", async research() { return evidence; } });
  registry.register({ name: "broken", async research() { throw new Error("unavailable"); } });
  await assert.rejects(() => registry.research({ productName: "Lamp", query: "lamp" }), /unavailable/);
});
