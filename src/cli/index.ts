import { createWorkflow, runWorkflow } from "../runtime/index.js";
import {
  LocalProductDiscovery,
  ProductProviderRegistry,
  ShopeeProvider,
} from "../product/index.js";

const args = process.argv.slice(2);

if (args[0] === "workflow" && args[1] === "run") {
  const goal = args.slice(2).join(" ") || "find a product to sell";

  const workflow = createWorkflow(goal);
  await runWorkflow(workflow);
  process.exit(0);
}

if (args[0] === "product" && args[1] === "providers") {
  const registry = new ProductProviderRegistry();

  registry.register(new ShopeeProvider());

  console.log("");
  console.log("=== PRODUCT PROVIDERS ===");

  for (const provider of registry.list()) {
    console.log(`- ${provider.name}`);
  }

  console.log("");

  process.exit(0);
}

if (args[0] === "product" && args[1] === "search") {
  const query = args.slice(2).join(" ").trim();

  if (!query) {
    console.error("Error: product search requires a query.");
    process.exit(1);
  }

  const discovery = new LocalProductDiscovery();
  const products = await discovery.search(query);

  console.log("");
  console.log("=== PRODUCT DISCOVERY ===");
  console.log(`Query: ${query}`);
  console.log(`Products found: ${products.length}`);
  console.log("");

  if (products.length === 0) {
    console.log("No products found.");
  }

  process.exit(0);
}

console.log("");
console.log("COMMERCA-CLI");
console.log("Commerce Automation Runtime");
console.log("");
console.log("Commands:");
console.log("  product search <query>");
console.log("  product providers");
console.log("  workflow run <goal>");
console.log("");
