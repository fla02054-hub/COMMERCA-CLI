import { runWorkflow } from "../runtime/index.js";
import { readShopeeProductDetail, searchRakatookyangProduct } from "../product/index.js";
import { agent } from "../agent/index.js";

const args = process.argv.slice(2);
const TEST_PRODUCT_URL = "https://s.shopee.co.th/2qUA6EnWAX";

if (args[0] === "agent" && args[1] === "run") {
  const goal = args.slice(2).join(" ");
  if (!goal) throw new Error("usage: agent run <goal>");
  const url = goal.match(/https?:\/\/\S+/)?.[0];
  const result = await agent.run({ goal, context: url ? { url } : undefined });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === "failed" ? 1 : 0);
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
console.log("  agent run <goal>");
console.log("  workflow run <goal>");
console.log("  product detail <url>");
console.log("  product search rakatookyang <product-url>");
console.log("  product test");
