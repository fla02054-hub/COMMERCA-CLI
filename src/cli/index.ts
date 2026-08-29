import { createWorkflow, runWorkflow } from "../runtime/index.js";
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
  const workflow = createWorkflow(goal);
  await runWorkflow(workflow);
  process.exit(0);
}

if (args[0] === "product" && args[1] === "providers") {
  const registry = createProductRegistry();
  console.log("\n=== PRODUCT PROVIDERS ===");
  for (const provider of registry.list()) console.log(`- ${provider.name}`);
  console.log("");
  process.exit(0);
}

if (args[0] === "product" && args[1] === "price-history") {
  const url = args.slice(2).join(" ").trim();
  if (!url) {
    console.error("Error: product price-history requires a Shopee product URL.");
    process.exit(1);
  }
  try {
    const product = await readRakatookyangPriceHistory(url);
    console.log("\n=== RAKATOOKYANG PRICE HISTORY ===");
    console.log(`Product: ${product.name}`);
    if (product.price !== undefined) console.log(`Current: ฿${product.price.toLocaleString()}`);
    if (product.lowestPrice !== undefined) console.log(`Lowest: ฿${product.lowestPrice.toLocaleString()}`);
    if (product.averagePrice !== undefined) console.log(`Average: ฿${product.averagePrice.toLocaleString()}`);
    if (product.originalPrice !== undefined) console.log(`Original: ฿${product.originalPrice.toLocaleString()}`);
    if (product.discount !== undefined) console.log(`Discount: ${product.discount}%`);
    if (product.rating !== undefined) console.log(`Rating: ${product.rating}`);
    if (product.reviewCount !== undefined) console.log(`Reviews: ${product.reviewCount.toLocaleString()}`);
    if (product.seller) console.log(`Seller: ${product.seller}`);
    console.log(`Shopee URL: ${product.url}`);
    console.log(`History points: ${product.priceHistory?.length ?? 0}`);
    for (const point of product.priceHistory ?? []) {
      console.log(`- ${point.date ?? "date unavailable"}: ฿${point.price.toLocaleString()}`);
    }
  } catch (error) {
    console.error(`rakatookyang price history failed: ${String(error)}`);
    process.exit(1);
  }
  process.exit(0);
}

if (args[0] === "product" && (args[1] === "search" || args[1] === "analyze")) {
  let providerName = "shopee-browser";
  let queryArgs = args.slice(2);

  if (queryArgs[0] === "--provider") {
    providerName = queryArgs[1] ?? "";
    queryArgs = queryArgs.slice(2);
  } else if (queryArgs[0] && createProductRegistry().get(queryArgs[0])) {
    providerName = queryArgs[0];
    queryArgs = queryArgs.slice(1);
  }

  const query = queryArgs.join(" ").trim();
  if (!query) {
    console.error(`Error: product ${args[1]} requires a query.`);
    process.exit(1);
  }

  try {
    const { provider, products } = await searchProducts(providerName, query);
    if (args[1] === "analyze") {
      const ranked = rankProducts(products);
      console.log("\n=== PRODUCT ANALYSIS ===");
      console.log(`Provider: ${provider.name}`);
      console.log(`Query: ${query}`);
      console.log(`Products analyzed: ${ranked.length}\n`);
      ranked.forEach((analysis, index) => {
        console.log(`${index + 1}. ${analysis.product.name}`);
        console.log(`   Score: ${analysis.score}/100`);
        console.log(`   Factors: price=${analysis.factors.price}, commission=${analysis.factors.commission}, demand=${analysis.factors.demand}, socialProof=${analysis.factors.socialProof}, promotion=${analysis.factors.promotion}, content=${analysis.factors.contentPotential}`);
        console.log(`   Reasons: ${analysis.reasons.join(", ")}`);
        if (analysis.product.price !== undefined) console.log(`   Price: ฿${analysis.product.price.toLocaleString()}`);
        if (analysis.product.commission !== undefined) console.log(`   Commission: ฿${analysis.product.commission.toLocaleString()}`);
        if (analysis.product.salesCount !== undefined) console.log(`   Sales: ${analysis.product.salesCount.toLocaleString()}`);
        if (analysis.product.url) console.log(`   URL: ${analysis.product.url}`);
        console.log("");
      });
    } else {
      console.log("\n=== PRODUCT DISCOVERY ===");
      console.log(`Provider: ${provider.name}`);
      console.log(`Query: ${query}`);
      console.log(`Products found: ${products.length}\n`);
      products.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name}`);
        if (product.price !== undefined) console.log(`   Price: ฿${product.price.toLocaleString()}`);
        if (product.originalPrice !== undefined) console.log(`   Original: ฿${product.originalPrice.toLocaleString()}`);
        if (product.discount !== undefined) console.log(`   Discount: ${product.discount}%`);
        if (product.rating !== undefined) console.log(`   Rating: ${product.rating}`);
        if (product.reviewCount !== undefined) console.log(`   Reviews: ${product.reviewCount.toLocaleString()}`);
        if (product.salesCount !== undefined) console.log(`   Sales: ${product.salesCount.toLocaleString()}`);
        if (product.seller) console.log(`   Seller: ${product.seller}`);
        if (product.promotion) console.log(`   Promotion: ${product.promotion}`);
        if (product.url) console.log(`   URL: ${product.url}`);
        console.log("");
      });
    }
  } catch (error) {
    console.error(`product ${args[1]} failed: ${String(error)}`);
    process.exit(1);
  }
  process.exit(0);
}

if (args[0] === "product" && args[1] === "detail") {
  const url = args.slice(2).join(" ").trim();
  if (!url) {
    console.error("Error: product detail requires a Shopee URL.");
    process.exit(1);
  }
  try {
    const product = await readShopeeProductDetail(url);
    console.log(JSON.stringify(product, null, 2));
  } catch (error) {
    console.error(`Shopee browser detail failed: ${String(error)}`);
    process.exit(1);
  }
  process.exit(0);
}

console.log(`
COMMERCA-CLI
Commerce Automation Runtime

Commands:
  product search <query>
  product search <provider> <query>
  product search --provider <provider> <query>
  product analyze <query>
  product analyze --provider <provider> <query>
  product detail <shopee-url>
  product price-history <shopee-url>
  product providers
  workflow run <goal>
`);
