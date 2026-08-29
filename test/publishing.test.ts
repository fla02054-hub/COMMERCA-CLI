import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublicationPlan, createPublicationRecord, validatePublicationPlan } from "../src/publishing/index.ts";

test("Stage 12 creates a publication plan from production output", () => {
  const plan = buildPublicationPlan(
    { video: { path: "/tmp/final.mp4" } },
    { caption: "Test caption", productUrl: "https://example.com/product" },
  );
  assert.equal(validatePublicationPlan(plan).length, 0);
  assert.equal(plan.targets[0].platform, "organic");
  assert.equal(plan.productUrl, "https://example.com/product");
  assert.equal(createPublicationRecord(plan).organic.status, "planned");
});

test("Stage 12 supports organic and ads targets", () => {
  const plan = buildPublicationPlan(
    { image: { path: "/tmp/final.jpg" } },
    { targets: [
      { id: "organic", platform: "organic", destination: "facebook" },
      { id: "ads", platform: "ads", destination: "meta" },
    ] },
  );
  const record = createPublicationRecord(plan);
  assert.equal(record.organic.targets.length, 1);
  assert.equal(record.ads.targets.length, 1);
});

test("Stage 12 rejects missing production media", () => {
  assert.throws(() => buildPublicationPlan({}));
});

test("Stage 12 rejects empty targets", () => {
  const plan = buildPublicationPlan({ video: true }, { targets: [{ id: "", platform: "organic", destination: "" }] });
  assert.ok(validatePublicationPlan(plan).length >= 2);
});
