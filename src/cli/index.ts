import { runWorkflow } from "../runtime/index.js";
import { readShopeeProductDetail, readRakatookyangPriceHistory } from "../product/index.js";
import { runShopeeBrowserAgent } from "../agents/shopee-browser-agent.js";

const args = process.argv.slice(2);

if (args[0] === "workflow" && args[1] === "run") {
  const goal = args.slice(2).join(" ") || "find a product to sell";
  const workflow = await runWorkflow(goal);
  console.log(JSON.stringify(workflow, null, 2));
  process.exit(workflow.state.stages.some((stage) => stage.status === "failed") ? 1 : 0);
}

if (args[0] === "product" && args[1] === "agent") {
  const url = args[2];
  if (!url) throw new Error("usage: product agent <url>");
  console.log(JSON.stringify(await runShopeeBrowserAgent(url), null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "detail") {
  const url = args[2];
  if (!url) throw new Error("usage: product detail <url>");
  console.log(JSON.stringify(await readShopeeProductDetail(url), null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "price-history") {
  const url = args[2];
  if (!url) throw new Error("usage: product price-history <url>");
  console.log(JSON.stringify(await readRakatookyangPriceHistory(url), null, 2));
  process.exit(0);
}

console.log("COMMERCA-CLI");
console.log("  workflow run <goal>");
console.log("  product agent <url>");
console.log("  product detail <url>");
console.log("  product price-history <url>");
