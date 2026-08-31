import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWorkflow, executeWorkflow } from "../src/runtime/flow.js";
import { createStageRegistry } from "../src/runtime/stage-registry.js";
import type { Product } from "../src/product/types.js";

const anchi: Product = {
  id: "manual-anchi-e2e",
  name: "Anchi จักรยานไฟฟ้าพับได้",
  url: "https://s.shopee.co.th/AUtc4tam67",
  price: 1,
  originalPrice: 1,
  discount: 0,
  promotion: "",
  source: "manual",
  discoveredAt: new Date().toISOString(),
  image: "https://example.com/anchi.jpg",
  images: ["https://example.com/anchi.jpg"],
};

test("direct product identity is propagated through the consolidated workflow", async () => {
  const production = { image: { path: "/tmp/anchi-image.jpg" }, video: { path: "/tmp/anchi-final.mp4" }, voice: { path: "/tmp/anchi-voice.wav" }, subtitle: { path: "/tmp/anchi-subtitle.srt" } };
  const result = await executeWorkflow(createRuntimeWorkflow(anchi.name), createStageRegistry({ product: anchi, production: async () => production as any }));
  assert.equal(result.state.status, "completed");
  const analysis = result.artifacts.find((item) => item.type === "product-analysis")?.data as any[];
  const scorecard = result.artifacts.find((item) => item.type === "scorecard")?.data as any[];
  const selection = result.artifacts.find((item) => item.type === "selection")?.data as any;
  const content = result.artifacts.find((item) => item.type === "content-package")?.data as any;
  const creative = result.artifacts.find((item) => item.type === "creative-strategy")?.data as any;
  const finalPackage = result.artifacts.find((item) => item.type === "final-package")?.data as any;
  assert.equal(analysis[0].product.name, anchi.name);
  assert.equal(analysis[0].product.url, anchi.url);
  assert.equal(scorecard[0].productId, anchi.id);
  assert.equal(selection.product.name, anchi.name);
  assert.equal(selection.product.url, anchi.url);
  assert.equal(content.title, anchi.name);
  assert.equal(content.productUrl, anchi.url);
  assert.match(content.caption, /Anchi จักรยานไฟฟ้าพับได้/);
  assert.equal(creative.image.every((prompt: string) => prompt.includes(anchi.name)), true);
  assert.equal(creative.video[0].includes(anchi.name), true);
  assert.equal(finalPackage.product.name, anchi.name);
  assert.equal(finalPackage.product.url, anchi.url);
  assert.equal(finalPackage.content.productUrl, anchi.url);
  assert.equal(finalPackage.publish.organic.productUrl, anchi.url);
  assert.equal(finalPackage.publish.ads.productUrl, anchi.url);
});
