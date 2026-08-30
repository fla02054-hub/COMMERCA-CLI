import { runWorkflow, runWorkflowWithProduct } from "../runtime/index.js";
import { readShopeeProductDetail, searchRakatookyangProduct } from "../product/index.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";

configureUtf8Console();

const args = process.argv.slice(2);
const TEST_PRODUCT_URL = "https://s.shopee.co.th/2qUA6EnWAX";
const ICE_MAKER_PRODUCT: Product = {
  id: "test-ice-maker-2026",
  name: "เครื่องทำน้ำแข็ง เครื่องทำน้ำแข็งอัตโนมัติ 2.3L ice maker เครื่องทำน้ำแข็งรุ่นใหม่ 2026",
  price: 2890,
  originalPrice: 3199,
  discount: Math.round(((3199 - 2890) / 3199) * 100),
  promotion: "ลดเหลือ ฿2,890 จากราคาปกติ ฿3,199",
  url: "https://s.shopee.co.th/6fgtBsfm7R",
  source: "rakatookyang",
  discoveredAt: new Date().toISOString(),
};

if (args[0] === "workflow" && args[1] === "run" && args[2] === "--fixture" && args[3] === "ice-maker") {
  const workflow = await runWorkflowWithProduct(
    "ทดสอบสินค้าเครื่องทำน้ำแข็งอัตโนมัติ 2.3L",
    ICE_MAKER_PRODUCT,
  );
  console.log(JSON.stringify(workflow, null, 2));
  process.exit(workflow.state.stages.some((stage) => stage.status === "failed") ? 1 : 0);
}

if (args[0] === "workflow" && args[1] === "run") {
  const goal = args.slice(2).join(" ") || "find a product to sell";
  const workflow = await runWorkflow(goal);
  console.log(JSON.stringify(workflow, null, 2));
  process.exit(workflow.state.stages.some((stage) => stage.status === "failed") ? 1 : 0);
}

if (args[0] === "product" && args[1] === "detail") {
  const url = args[2];
  if (!url) throw new Error("usage: product detail <url>");
  console.log(JSON.stringify(await readShopeeProductDetail(url), null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "search" && args[2] === "rakatookyang") {
  const url = args[3];
  if (!url) throw new Error("usage: product search rakatookyang <product-url>");
  console.log(JSON.stringify(await searchRakatookyangProduct(url), null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "test") {
  console.log(JSON.stringify(await searchRakatookyangProduct(TEST_PRODUCT_URL), null, 2));
  process.exit(0);
}

console.log("COMMERCA-CLI");
console.log("  workflow run <goal>");
console.log("  workflow run --fixture ice-maker");
console.log("  product detail <url>");
console.log("  product search rakatookyang <product-url>");
console.log("  product test");
