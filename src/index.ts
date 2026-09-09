import { CONNECTIONS, FlowEngine, FLOW } from "./core/flow.js";
import type { FlowNode, ProductInput } from "./core/types.js";
import { ProductNode } from "./nodes/product.js";
import { AnalysisNode } from "./nodes/analysis.js";
import { ContentNode } from "./nodes/content.js";
import { ProductionNode } from "./nodes/production.js";
import { PostNode } from "./nodes/post.js";
import { PostAnalysisNode } from "./nodes/post-analysis.js";
import { Aiden } from "./aiden/aiden.js";
import { listJobs, loadJob } from "./core/store.js";

const nodes: FlowNode[] = [
  new ProductNode(),
  new AnalysisNode(),
  new ContentNode(),
  new ProductionNode(),
  new PostNode(),
  new PostAnalysisNode()
];
const flow = new FlowEngine(nodes);
const aiden = new Aiden(flow);

function value(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function number(flag: string): number | undefined {
  const v = value(flag);
  return v === undefined ? undefined : Number(v);
}

function printFlow(): void {
  console.log("AIDEN");
  console.log("  │");
  console.log("  ▼");
  FLOW.forEach((name, index) => {
    console.log(`[${name}]`);
    if (index < FLOW.length - 1) console.log("    │\n    ▼");
  });
  console.log("    │");
  console.log("    └────────► AIDEN");
  console.log("\nConnections:");
  for (const connection of CONNECTIONS) console.log(`  ${connection.from} ──► ${connection.to}`);
}

function printJob(job: ReturnType<typeof loadJob>): void {
  console.log(JSON.stringify(job, null, 2));
}

async function main(): Promise<void> {
  const [, , command, subcommand] = process.argv;
  if (command === "flow") { printFlow(); return; }
  if (command === "job" && subcommand === "list") { listJobs().forEach(j => console.log(`${j.id}  ${j.status}  ${j.currentNode ?? "done"}`)); return; }
  if (command === "job" && subcommand === "show") { const id = value("--id"); if (!id) throw new Error("--id is required"); printJob(loadJob(id)); return; }
  if (command === "workflow" && subcommand === "run") {
    const input: ProductInput = {
      name: value("--product") ?? "",
      price: number("--price"),
      originalPrice: number("--original-price"),
      url: value("--url"),
      image: value("--image"),
      source: value("--source") ?? "manual"
    };
    const job = await aiden.run(input);
    printJob(job);
    return;
  }
  console.log("COMMERCA-CLI");
  console.log("Commands: flow | workflow run --product <name> [--price n] [--original-price n] [--url url] [--image path] | job list | job show --id <id>");
}

main().catch(error => { console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
