import { runWorkflowWithProduct } from "../runtime/index.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";

configureUtf8Console();

const args = process.argv.slice(2);

function failed(workflow: Awaited<ReturnType<typeof runWorkflowWithProduct>>): never | void {
  process.exit(workflow.state.stages.some((stage) => stage.status === "failed") ? 1 : 0);
}

function valueAfter(flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function valuesAfter(flag: string): string[] {
  const index = args.indexOf(flag);
  if (index < 0) return [];
  const values: string[] = [];
  for (const value of args.slice(index + 1)) {
    if (value.startsWith("--")) break;
    values.push(value);
  }
  return values;
}

function parsePrice(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const price = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(price) || price < 0) throw new Error(`${label} must be a valid non-negative number.`);
  return price;
}

if (args[0] === "workflow" && args[1] === "run" && args[2] === "--fixture" && args[3] === "ice-maker") {
  const product: Product = {
    id: "test-ice-maker-2026",
    name: "เครื่องทำน้ำแข็ง เครื่องทำน้ำแข็งอัตโนมัติ 2.3L ice maker เครื่องทำน้ำแข็งรุ่นใหม่ 2026",
    price: 2890,
    originalPrice: 3199,
    discount: Math.round(((3199 - 2890) / 3199) * 100),
    promotion: "ลดเหลือ ฿2,890 จากราคาปกติ ฿3,199",
    url: "https://s.shopee.co.th/6fgtBsfm7R",
    image: "fixture://ice-maker",
    images: ["fixture://ice-maker"],
    source: "manual-fixture",
    discoveredAt: new Date().toISOString(),
  };
  const workflow = await runWorkflowWithProduct(product.name, product);
  console.log(JSON.stringify(workflow, null, 2));
  failed(workflow);
}

if (args[0] === "workflow" && args[1] === "run" && args.includes("--product")) {
  const name = valueAfter("--product");
  const price = parsePrice(valueAfter("--price"), "Special price");
  const originalPrice = parsePrice(valueAfter("--original-price"), "Original price");
  const url = valueAfter("--url");
  const image = valueAfter("--image");
  const suppliedImages = valuesAfter("--images");

  if (!name || price === undefined || originalPrice === undefined || !url || !image) {
    throw new Error(
      "usage: workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]",
    );
  }

  if (originalPrice < price) {
    throw new Error("Original price cannot be lower than the special price.");
  }

  const images = [...new Set([image, ...suppliedImages].filter(Boolean))];
  const discount = originalPrice > 0
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;
  const promotion = originalPrice !== price
    ? `ลดเหลือ ฿${price.toLocaleString("th-TH")} จากราคาปกติ ฿${originalPrice.toLocaleString("th-TH")}`
    : undefined;

  const product: Product = {
    id: `manual-${crypto.randomUUID()}`,
    name,
    price,
    originalPrice,
    discount,
    promotion,
    url,
    image,
    images,
    source: "manual",
    discoveredAt: new Date().toISOString(),
  };
  const workflow = await runWorkflowWithProduct(name, product);
  console.log(JSON.stringify(workflow, null, 2));
  failed(workflow);
}

if (args[0] === "product" && args[1] === "detail") {
  const { readShopeeProductDetail } = await import("../product/index.js");
  const url = args[2];
  if (!url) throw new Error("usage: product detail <url>");
  console.log(JSON.stringify(await readShopeeProductDetail(url), null, 2));
  process.exit(0);
}

console.log("COMMERCA-CLI");
console.log("  workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
console.log("  workflow run --fixture ice-maker");
console.log("  product detail <url>");
