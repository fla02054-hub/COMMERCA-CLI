import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { createStageRegistry } from "../src/runtime/stage-registry.ts";
import { artifact } from "../src/runtime/stages.ts";
import type { StageContext } from "../src/runtime/stage-contract.ts";

const outputDir = "/tmp/commerca-final-package";
const packagePath = `${outputDir}/final-content-package.json`;

test("Final Content Package is serialized as a post-ready bundle", async () => {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const product = {
    id: "test-product",
    name: "Test Product",
    url: "https://example.com/product",
    price: 499,
    originalPrice: 799,
    discount: 300,
    commission: 60,
    rating: 4.8,
    reviewCount: 100,
    salesCount: 500,
    seller: "Test Seller",
    promotion: "Test promotion",
    source: "test",
    discoveredAt: new Date().toISOString(),
    image: "https://example.com/product.jpg",
    images: ["https://example.com/product.jpg"],
  };

  const content = {
    caption: "โปรเด็ดสำหรับคนกำลังมองหาของดี ราคาคุ้ม",
    hashtags: ["#โปรเด็ด", "#Shopee", "#ของดีบอกต่อ"],
    callToAction: "กดดูรายละเอียดและโปรโมชันได้เลย",
    productUrl: product.url,
  };
  const creative = { hook: "ราคานี้คุ้มมาก", scenes: [{ duration: 2, prompt: "product" }] };
  const production = {
    image: { path: "/tmp/final.jpg" },
    video: { path: "/tmp/final.mp4" },
    voice: { path: "/tmp/voice.wav" },
    subtitle: { path: "/tmp/subtitle.srt" },
  };
  const qc = { passed: true, issues: [] };

  const registry = createStageRegistry({ production: async () => production as any });
  const context: StageContext = {
    workflowId: "final-package-e2e",
    goal: "test final content package",
    stage: "publishing",
    artifacts: [
      artifact("product-input", "product-input", product),
      artifact("content-strategy", "content-package", content),
      artifact("creative-strategy", "creative-strategy", creative),
      artifact("production", "production-package", production),
      artifact("qc", "qc-report", qc),
    ],
  };

  const result = await registry.get("publishing").execute(context);
  const finalPackage = result.artifacts.find((item) => item.type === "final-package")?.data as any;
  assert.ok(finalPackage);
  assert.equal(finalPackage.product.name, product.name);
  assert.equal(finalPackage.content.caption, content.caption);
  assert.deepEqual(finalPackage.content.hashtags, content.hashtags);
  assert.equal(finalPackage.content.productUrl, product.url);
  assert.equal(finalPackage.publish.organic.status, "ready");
  assert.equal(finalPackage.publish.ads.status, "ready");
  assert.ok(finalPackage.production.video.path.endsWith("final.mp4"));
  assert.equal(JSON.stringify(finalPackage).includes("finalPackage"), false);

  const serialized = JSON.parse(await readFile(packagePath, "utf8"));
  assert.equal(serialized.content.caption, content.caption);
  assert.ok(Array.isArray(serialized.content.hashtags));
  assert.equal(serialized.content.productUrl, product.url);
  assert.ok(serialized.production.video.path.endsWith("final.mp4"));
});
