import assert from "node:assert/strict";
import test from "node:test";
import { generateContent } from "../src/content/index.js";
import { buildCreativeStrategy } from "../src/creative/index.js";

const product = {
  id: "manual-anchi-safety",
  name: "Anchi จักรยานไฟฟ้าพับได้",
  url: "https://s.shopee.co.th/AUtc4tam67",
  price: 7795,
  originalPrice: 9999,
  discount: 2204,
  promotion: "",
  source: "manual",
  discoveredAt: new Date().toISOString(),
  image: "https://example.com/anchi.jpg",
  images: ["https://example.com/anchi.jpg"],
};

test("publish caption keeps URL in first comment only", () => {
  const content = generateContent({ product } as any);
  assert.equal(content.productUrl, product.url);
  assert.equal(content.firstComment.includes(product.url), true);
  assert.equal(content.caption.includes(product.url), false);
});

test("creative rejects internal analysis leakage", () => {
  const content = generateContent({ product } as any);
  assert.throws(() => buildCreativeStrategy({
    ...content,
    body: `${content.body} good content potential.`,
  }), /internal analysis text/);
});

test("creative remains anchored to the direct product identity", () => {
  const content = generateContent({ product } as any);
  const creative = buildCreativeStrategy(content);
  assert.equal(creative.storyboard.every((scene) => scene.includes(product.name)), true);
  assert.equal(creative.image.every((prompt) => prompt.includes(product.name)), true);
  assert.equal(creative.video.every((prompt) => prompt.includes(product.name)), true);
  assert.equal(creative.prompt.every((prompt) => prompt.includes(product.name)), true);
});
