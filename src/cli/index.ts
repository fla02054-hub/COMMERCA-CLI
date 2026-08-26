import { createWorkflow, runWorkflow } from "../runtime/index.js";
import {
  readShopeeProductDetail,
  ShopeeBrowserProvider,
} from "../product/index.js";

const args = process.argv.slice(2);

if (args[0] === "workflow" && args[1] === "run") {
  const goal = args.slice(2).join(" ") || "find a product to sell";
  const workflow = createWorkflow(goal);
  await runWorkflow(workflow);
  process.exit(0);
}

if (args[0] === "product" && args[1] === "providers") {
  console.log("");
  console.log("=== PRODUCT PROVIDERS ===");
  console.log("- shopee-browser (Chrome Extension)");
  console.log("");
  process.exit(0);
}

if (args[0] === "product" && args[1] === "search") {
  const query = args.slice(2).join(" ").trim();
  if (!query) {
    console.error("Error: product search requires a query.");
    process.exit(1);
  }

  try {
    const provider = new ShopeeBrowserProvider();
    const products = await provider.search(query);

    console.log("");
    console.log("=== SHOPEE PRODUCT DISCOVERY ===");
    console.log(`Query: ${query}`);
    console.log(`Products found: ${products.length}`);
    console.log("");

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
  } catch (error) {
    console.error(`Shopee browser search failed: ${String(error)}`);
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

console.log("");
console.log("COMMERCA-CLI");
console.log("Commerce Automation Runtime");
console.log("");
console.log("Commands:");
console.log("  product search <query>");
console.log("  product detail <shopee-url>");
console.log("  product providers");
console.log("  workflow run <goal>");
console.log("");
