import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicationPlan, createPublicationRecord, validatePublicationPlan } from "../src/publishing/index.ts";

test("Stage 12 creates a Facebook post-ready plan with final video and Product URL", () => {
  const plan = buildPublicationPlan(
    { video: { path: "/tmp/final.mp4" } },
    { caption: "Test caption", productUrl: "https://example.com/product" },
  );
  assert.equal(validatePublicationPlan(plan).length, 0);
  assert.equal(plan.targets[0].platform, "organic");
  assert.equal(plan.targets[0].destination, "facebook");
  assert.equal(plan.productUrl, "https://example.com/product");
  assert.equal(plan.mediaPath, "/tmp/final.mp4");
  assert.equal(plan.ready, true);
  assert.equal(createPublicationRecord(plan).organic.status, "ready");
});

test("Stage 12 supports organic and ads targets", () => {
  const plan = buildPublicationPlan(
    { video: { path: "/tmp/final.mp4" } },
    { caption: "Sales caption", productUrl: "https://example.com/product", targets: [
      { id: "organic", platform: "organic", destination: "facebook" },
      { id: "ads", platform: "ads", destination: "meta" },
    ] },
  );
  const record = createPublicationRecord(plan);
  assert.equal(record.organic.targets.length, 1);
  assert.equal(record.ads.targets.length, 1);
  assert.equal(record.organic.status, "ready");
});

test("Stage 12 rejects missing production media", () => {
  assert.throws(() => buildPublicationPlan({}, { caption: "x", productUrl: "https://example.com/product" }));
});

test("Stage 12 rejects missing Product URL", () => {
  assert.throws(() => buildPublicationPlan({ video: { path: "/tmp/final.mp4" } }, { caption: "x" }));
});

test("Stage 12 rejects missing sales caption", () => {
  assert.throws(() => buildPublicationPlan({ video: { path: "/tmp/final.mp4" } }, { productUrl: "https://example.com/product" }));
});

test("Stage 12 rejects empty targets", () => {
  const plan = buildPublicationPlan({ video: true }, { caption: "x", productUrl: "https://example.com/product", targets: [{ id: "", platform: "organic", destination: "" }] });
  assert.ok(validatePublicationPlan(plan).length >= 2);
});
