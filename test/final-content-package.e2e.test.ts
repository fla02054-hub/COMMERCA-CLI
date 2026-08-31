import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { createStageRegistry } from "../src/runtime/stage-registry.ts";
import { artifact } from "../src/runtime/stages.ts";
import type { StageContext } from "../src/runtime/stage-contract.ts";

const outputDir = "/tmp/commerca-final-package";
const packagePath = `${outputDir}/final-content-package.json`;

test("Final Content Package is assembled separately from publishing", async () => {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const product = { id: "test-product", name: "Test Product", url: "https://example.com/product", price: 499, originalPrice: 799, discount: 300, commission: 60, rating: 4.8, reviewCount: 100, salesCount: 500, seller: "Test Seller", promotion: "Test promotion", source: "test", discoveredAt: new Date().toISOString(), image: "https://example.com/product.jpg", images: ["https://example.com/product.jpg"] };
  const content = { title: "Test Product", hook: "ราคาคุ้ม", body: "รายละเอียด", caption: "โปรเด็ดสำหรับคนกำลังมองหาของดี ราคาคุ้ม", hashtags: ["#โปรเด็ด", "#Shopee", "#ของดีบอกต่อ"], callToAction: "กดดูรายละเอียดและโปรโมชันได้เลย", productUrl: product.url, firstComment: `🛒 พิกัดสินค้า 👇\n🔗 ${product.url}`, voiceScript: ["1","2","3","4","5"], subtitleScript: ["1","2","3","4","5"] };
  const creative = { image: ["product"], video: ["product"], storyboard: ["product"], prompt: ["product"], voiceScript: content.voiceScript, subtitleScript: content.subtitleScript };
  const production = { image: { path: "/tmp/final.jpg" }, video: { path: "/tmp/final.mp4" }, voice: { path: "/tmp/voice.wav" }, subtitle: { path: "/tmp/subtitle.srt" } };
  const qc = { passed: true, issues: [] };
  const publication = { organic: { status: "ready", productUrl: product.url, videoPath: "/tmp/final.mp4" }, ads: { status: "ready", productUrl: product.url, videoPath: "/tmp/final.mp4" } };
  const previous = process.env.COMMERCA_OUTPUT_DIR;
  process.env.COMMERCA_OUTPUT_DIR = outputDir;
  try {
    const registry = createStageRegistry({ production: async () => production as any });
    const context: StageContext = { workflowId: "final-package-e2e", goal: "test final content package", stage: "final-package", artifacts: [
      artifact("product-input", "product-input", product), artifact("product-analysis", "selection", { product }), artifact("content-strategy", "content-package", content), artifact("creative-strategy", "creative-strategy", creative), artifact("production", "production-package", production), artifact("qc", "qc-report", qc), artifact("publishing", "publication", publication),
    ] };
    const result = await registry.get("final-package").execute(context);
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
    const post = await readFile(`${outputDir}/post.txt`, "utf8");
    assert.ok(post.includes(content.caption));
    assert.ok(post.includes(product.url));
  } finally {
    if (previous === undefined) delete process.env.COMMERCA_OUTPUT_DIR; else process.env.COMMERCA_OUTPUT_DIR = previous;
  }
});
