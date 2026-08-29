import { runWorkflow } from "../runtime/index.js";
import {
  ProductProviderRegistry,
  RakatookyangProvider,
  rankProducts,
  readRakatookyangPriceHistory,
  readShopeeProductDetail,
  ShopeeBrowserProvider,
} from "../product/index.js";
import { parseProductSearchArgs } from "./product-search.js";

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
  console.log(JSON.stringify(registry.list(), null, 2));
  process.exit(0);
}

if (args[0] === "product" && (args[1] === "search" || args[1] === "open-search")) {
  const registry = createProductRegistry();
  const knownProviders = registry.list().map((x) => x.name);
  const mode = parseProductSearchArgs(args.slice(2), knownProviders);

  if (mode.mode === "url") {
    const { products } = await searchProducts("rakatookyang", mode.url);
    console.log(JSON.stringify(products, null, 2));
    process.exit(0);
  }

  if (mode.mode === "provider") {
    const { products } = await searchProducts(mode.provider, mode.query);
    console.log(JSON.stringify(products, null, 2));
    process.exit(0);
  }

  // Default search intentionally uses the visible RakaTookYang browser flow.
  const { products } = await searchProducts("rakatookyang", mode.query);
  console.log(JSON.stringify(products, null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "inspect") {
  const url = args.slice(2).join(" ").trim();
  if (!url) throw new Error("usage: product inspect <url>");
  const provider = new RakatookyangProvider();
  console.log(JSON.stringify(await provider.inspect(url), null, 2));
  process.exit(0);
}

if (args[0] === "product" && args[1] === "audit") {
  const url = args[2] || "https://rakatookyang.com/";
  const provider = new RakatookyangProvider();
  const result = await provider.audit(url);
  console.log(JSON.stringify(result, null, 2));
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
console.log("  product search <query>");
console.log("  product search <provider> <query>");
console.log("  product search --provider <provider> <query>");
console.log("  product search <url>");
console.log("  product search --url <url>");
console.log("  product open-search <query>");
console.log("  product inspect <url>");
console.log("  product audit [url]");
console.log("  product rank <provider> <query>");
console.log("  product detail <url>");
console.log("  product price-history <url>");
