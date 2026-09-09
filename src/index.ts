import { FlowEngine } from "./core/flow.js";
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
  new ProductNode(), new AnalysisNode(), new ContentNode(),
  new ProductionNode(), new PostNode(), new PostAnalysisNode()
];
const flow = new FlowEngine(nodes);
const aiden = new Aiden(flow);

function value(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function number(flag: string): number | undefined {
  const v = value(flag);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${flag} must be a number.`);
  return n;
}

function has(flag: string): boolean { return process.argv.includes(flag); }

function printFlow(): void {
  const graph = flow.getGraph();
  console.log(`AIDEN [ADMIN / CONTROLLER]`);
  console.log(`Workflow: ${graph.workflow} v${graph.version}`);
  console.log(`  │\n  ▼`);
  for (const [index, name] of graph.nodes.entries()) {
    const node = nodes[index];
    console.log(`┌─────────────────┐`);
    console.log(`│ ${name.padEnd(15)} │`);
    console.log(`└─────────────────┘`);
    console.log(`  IN : ${node.inputPorts.map(p => p.name).join(", ") || "-"}`);
    console.log(`  OUT: ${node.outputPorts.map(p => p.name).join(", ") || "-"}`);
    if (index < graph.nodes.length - 1) console.log("        │\n        ▼");
  }
  console.log("        │\n        └──────────────► AIDEN [ADMIN]");
  console.log("\nConnections:");
  for (const c of graph.connections) console.log(`  ${c.from}.${c.output} → ${c.to}.${c.input}`);
}

function printJob(job: ReturnType<typeof loadJob>): void { console.log(JSON.stringify(job, null, 2)); }

function help(): void {
  console.log(`COMMERCA-CLI\n\nCommands:\n  flow\n  workflow show\n  workflow validate\n  workflow plan\n  workflow run --product <name> [--price n] [--original-price n] [--url url] [--image path] [--source name] [--retry n] [--dry-run]\n  workflow resume --id <id> [--retry n]\n  job list\n  job show --id <id>`);
}

async function main(): Promise<void> {
  const [, , command, subcommand] = process.argv;

  if (!command || command === "help" || command === "--help" || command === "-h") { help(); return; }
  if (command === "flow") { flow.validate(); printFlow(); return; }
  if (command === "workflow" && subcommand === "show") { console.log(JSON.stringify(flow.getWorkflow(), null, 2)); return; }
  if (command === "workflow" && subcommand === "validate") { flow.validate(); console.log("WORKFLOW VALID: OK"); return; }
  if (command === "workflow" && subcommand === "plan") { console.log(flow.plan().join(" → ")); return; }

  if (command === "workflow" && subcommand === "run") {
    const input: ProductInput = {
      name: value("--product") ?? "",
      price: number("--price"),
      originalPrice: number("--original-price"),
      url: value("--url"), image: value("--image"), source: value("--source") ?? "manual"
    };
    const retry = number("--retry");
    const job = await aiden.run(input, { maxAttempts: retry ?? 1, dryRun: has("--dry-run") });
    printJob(job);
    return;
  }

  if (command === "workflow" && subcommand === "resume") {
    const id = value("--id");
    if (!id) throw new Error("--id is required");
    const retry = number("--retry");
    const job = await aiden.resume(loadJob(id), { maxAttempts: retry ?? 1 });
    printJob(job);
    return;
  }

  if (command === "job" && subcommand === "list") {
    const jobs = listJobs();
    if (!jobs.length) { console.log("No jobs."); return; }
    jobs.forEach(j => console.log(`${j.id}  ${j.status.padEnd(10)}  ${j.currentNode ?? "done"}  ${j.workflowName}@${j.workflowVersion}`));
    return;
  }

  if (command === "job" && subcommand === "show") {
    const id = value("--id"); if (!id) throw new Error("--id is required");
    printJob(loadJob(id)); return;
  }

  help();
}

main().catch(error => {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
