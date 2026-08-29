import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeProduct } from "../src/product/analysis.ts";
import { buildContentStrategy, validateContentStrategy } from "../src/content/index.ts";
import { buildCreativeStrategy, validateCreativeStrategy } from "../src/creative/index.ts";

const analysis = analyzeProduct({
  name: "Test Product",
  url: "https://example.com/product",
  price: 299,
  commission: 100,
  salesCount: 5000,
  rating: 4.8,
  reviewCount: 1200,
  discount: 30,
  promotion: "ลดเพิ่มพร้อมคูปอง",
});

test("Stage 08 creates a complete content strategy", () => {
  const strategy = buildContentStrategy(analysis);
  assert.equal(validateContentStrategy(strategy).length, 0);
  assert.ok(strategy.angles.length >= 3);
  assert.ok(strategy.hooks.length >= 3);
  assert.match(strategy.copyBrief, /Test Product/);
  assert.ok(strategy.callToAction.length > 0);
  assert.equal(strategy.productUrl, "https://example.com/product");
});

test("Stage 08 rejects an incomplete content strategy", () => {
  const errors = validateContentStrategy({ angles: [], hooks: [], copyBrief: "", callToAction: "" });
  assert.ok(errors.length >= 4);
});

test("Stage 09 creates a complete creative strategy from content", () => {
  const content = {
    title: "Test Product",
    hook: "🔥 Test Product — ฿299",
    body: "สินค้าเด่นที่น่าสนใจในตอนนี้ ลดเพิ่มพร้อมคูปอง strong commission.",
    callToAction: "ดูรายละเอียดและเช็กราคาที่หน้าสินค้า",
    productUrl: "https://example.com/product",
  };
  const creative = buildCreativeStrategy(content);
  assert.equal(validateCreativeStrategy(creative).length, 0);
  assert.ok(creative.image.length >= 1);
  assert.ok(creative.video.length >= 1);
  assert.equal(creative.storyboard.length, 5);
  assert.ok(creative.prompt.some((prompt) => /9:16/.test(prompt)));
});

test("Stage 09 rejects missing content inputs", () => {
  assert.throws(() => buildCreativeStrategy({ title: "", hook: "", body: "", callToAction: "" }));
});

test("Stage 09 rejects an incomplete creative strategy", () => {
  const errors = validateCreativeStrategy({ image: [], video: [], storyboard: [], prompt: [] });
  assert.ok(errors.length >= 4);
});
