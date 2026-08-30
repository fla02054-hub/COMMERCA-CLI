import { describe, expect, it } from "vitest";
import { validatePublishPackage } from "../src/publish";

describe("publishing", () => {
  it("accepts a complete post-ready package", () => {
    const result = validatePublishPackage({
      videoPath: "/tmp/final.mp4",
      caption: "Test Product ราคา 499 บาท จาก 799 บาท ลด 300 บาท — Test promotion",
      hashtags: ["#TestProduct", "#Shopee", "#โปรเด็ด"],
      callToAction: "กดดูรายละเอียดและโปรโมชันได้เลย",
      productUrl: "https://example.com/product"
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a package without a product URL", () => {
    const result = validatePublishPackage({
      videoPath: "/tmp/final.mp4",
      caption: "Test Product ราคา 499 บาท",
      hashtags: ["#TestProduct"],
      callToAction: "กดดูรายละเอียดได้เลย",
      productUrl: ""
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a package without a final mp4", () => {
    const result = validatePublishPackage({
      videoPath: "",
      caption: "Test Product ราคา 499 บาท",
      hashtags: ["#TestProduct"],
      callToAction: "กดดูรายละเอียดได้เลย",
      productUrl: "https://example.com/product"
    });
    expect(result.valid).toBe(false);
  });
});
