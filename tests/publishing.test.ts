import { describe, expect, it } from "vitest";
import { validatePublishPackage } from "../src/publish";

describe("publishing", () => {
  it("requires a real final mp4, post copy, and product URL", () => {
    const result = validatePublishPackage({
      videoPath: "/tmp/final.mp4",
      caption: "Test Product ราคา 499 บาท จาก 799 บาท ลด 300 บาท — Test promotion",
      hashtags: ["#TestProduct", "#Shopee", "#โปรเด็ด"],
      callToAction: "กดดูรายละเอียดและโปรโมชันได้เลย",
      productUrl: "https://example.com/product"
    });
    expect(result.valid).toBe(true);
  });
});
