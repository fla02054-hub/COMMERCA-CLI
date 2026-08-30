import { describe, expect, it } from "vitest";
import { generateCreative } from "../src/creative/index";

describe("creative", () => {
  it("creates a five-scene product-selling storyboard", async () => {
    const creative = await generateCreative({
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
      discoveredAt: "2026-08-30T09:50:36.350Z",
      image: "https://example.com/product.jpg",
      images: ["https://example.com/product.jpg"]
    });

    expect(creative.scenes).toHaveLength(5);
    expect(creative.hook.trim()).not.toBe("ราคานี้คุ้มมาก");
    expect(creative.scenes.every((scene) => scene.prompt.trim().length > 10)).toBe(true);
  });
});
