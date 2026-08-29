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

const isUrl = (value?: string) => {
  try {
    if (!value) return false;
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

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

if (args[0] === "product" && args[1] === "search") {
  const input = args.slice(2).join(" ").trim();
  if (!input) {
    throw new Error("usage: product search <url-or-query>");
  }

  // URL-first mode: paste ANY HTTP(S) product/search URL directly.
  // Do not send URLs through the keyword/Rakatookyang search form.
  // Shopee URLs are opened in the browser and parsed as a product detail.
  if (isUrl(input)) {
    const product = await readShopeeProductDetail(input);
    console.log(JSON.stringify([product], null, 2));
    process.exit(0);
  }

  // Keyword mode remains available when an explicit provider is supplied.
  const providerName = args[2];
  const query = args.slice(3).join(" ").trim();
  if (!providerName || !query) {
    throw new Error(
      "usage: product search <url-or-query>\n" +
      "URL mode: product search <url>\n" +
      "Provider mode: product search <provider> <query>",
    );
  }
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
console.log("  product search <url-or-query>");
console.log("  product search <provider> <query>");
console.log("  product rank <provider> <query>");
console.log("  product detail <url>");
console.log("  product price-history <url>");
