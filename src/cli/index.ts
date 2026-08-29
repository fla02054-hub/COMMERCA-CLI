import { runWorkflow } from "../runtime/index.js";
import {
  ProductProviderRegistry,
  RakatookyangProvider,
  rankProducts,
  readRakatookyangPriceHistory,
  readShopeeProductDetail,
  ShopeeBrowserProvider,
} from "../product/index.js";

const args = process.argv.slice(2);

function createProductRegistry(): ProductProviderRegistry {
  const registry = new ProductProviderRegistry();
  registry.register(new ShopeeBrowserProvider());
  registry.register(new RakatookyangProvider());
  return registry;
}

async function searchProducts(providerName: string, query: string) {
  const registry = createProductRegistry();
  const provider = registry.get(providerName);
  if (!provider) throw new Error(`unknown product provider: ${providerName}`);
  return { provider, products: await provider.search(query) };
}

if (args[0] === "workflow" && args[1] === "run") {
  const goal = args.slice(2).join(" ") || "find a product to sell";
  const workflow = await runWorkflow(goal);
  console.log(JSON.stringify(workflow, null, 2));
  process.exit(workflow.state.stages.some((stage) => stage.status === "failed") ? 1 : 0);
}

if (args[0] === "product" && args[1] === "providers") {
  const registry = createProductRegistry();
  console.log(registry.list().join("\n"));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "search") {
  const providerName = args[2];
  const query = args.slice(3).join(" ");
  if (!providerName || !query) throw new Error("usage: product search <provider> <query>");
  const { products } = await searchProducts(providerName, query);
  console.log(JSON.stringify(products, null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "rank") {
  const providerName = args[2];
  const query = args.slice(3).join(" ");
  if (!providerName || !query) throw new Error("usage: product rank <provider> <query>");
  const { products } = await searchProducts(providerName, query);
  console.log(JSON.stringify(rankProducts(products), null, 2));
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
console.log("  product providers");
console.log("  product search <provider> <query>");
console.log("  product rank <provider> <query>");
console.log("  product detail <url>");
console.log("  product price-history <url>");
