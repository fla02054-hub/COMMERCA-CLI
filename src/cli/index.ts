import { runWorkflowWithProduct } from "../runtime/index.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";

configureUtf8Console();

const args = process.argv.slice(2);

function failed(workflow: Awaited<ReturnType<typeof runWorkflowWithProduct>>): never | void {
  process.exit(workflow.state.stages.some((stage) => stage.status === "failed") ? 1 : 0);
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
    source: "manual-fixture",
    discoveredAt: new Date().toISOString(),
  };
  const workflow = await runWorkflowWithProduct(product.name, product);
  console.log(JSON.stringify(workflow, null, 2));
  failed(workflow);
}

if (args[0] === "workflow" && args[1] === "run" && args[2] === "--product") {
  const name = args[3];
  const priceText = args[4];
  const url = args[5];
  const image = args[6];
  if (!name || !priceText || !url || !image) {
    throw new Error("usage: workflow run --product <name> <price> <url> <image>");
  }
  const price = Number(priceText.replace(/,/g, ""));
  if (!Number.isFinite(price) || price < 0) throw new Error("Product price must be a valid non-negative number.");

  const product: Product = {
    id: `manual-${crypto.randomUUID()}`,
    name,
    price,
    url,
    image,
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
console.log("  workflow run --product <name> <price> <url> <image>");
console.log("  workflow run --fixture ice-maker");
console.log("  product detail <url>");
