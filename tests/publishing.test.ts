import { describe, expect, it } from "vitest";
import { buildPublicationPlan, validatePublicationPlan } from "../src/publishing/index";
import type { ProductionPackage } from "../src/runtime/stage-artifacts";

const production: ProductionPackage = {
  editing: { finalMp4: "/tmp/final.mp4" }
};

describe("publishing", () => {
  it("builds a ready publication plan", () => {
    const plan = buildPublicationPlan(production, {
      caption: "Test Product ราคา ฿499 จาก ฿799 ลด ฿300",
      productUrl: "https://example.com/product"
    });
    expect(plan.ready).toBe(true);
    expect(plan.mediaPath).toBe("/tmp/final.mp4");
    expect(plan.productUrl).toBe("https://example.com/product");
  });

  it("rejects an empty target list", () => {
    const errors = validatePublicationPlan({
      targets: [],
      caption: "Test Product ราคา ฿499",
      productUrl: "https://example.com/product",
      mediaPath: "/tmp/final.mp4",
      ready: false
    });
    expect(errors).toContain("publishing requires at least one target");
  });
});
