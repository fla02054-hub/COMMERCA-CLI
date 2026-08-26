import { createWorkflow, runWorkflow } from "../runtime/index.js";

const args = process.argv.slice(2);

if (args[0] === "workflow" && args[1] === "run") {
  const goal = args.slice(2).join(" ") || "find a product to sell";

  const workflow = createWorkflow(goal);
  await runWorkflow(workflow);
  process.exit(0);
}

console.log("");
console.log("COMMERCA-CLI");
console.log("Commerce Automation Runtime");
console.log("");
console.log("Commands:");
console.log("  workflow run <goal>");
console.log("");
