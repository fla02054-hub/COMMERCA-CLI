import { ShopeeProvider } from "../product/providers/shopee.js";
import { rankProducts, type Product } from "../product/index.js";
import { generateContent, type ContentPackage } from "../content/index.js";
import { runContentQC, type QCResult } from "../qc/index.js";

export type WorkflowStatus = "idle" | "running" | "completed" | "failed";

export interface WorkflowContext {
  goal: string;
  status: WorkflowStatus;
  discoveredProducts?: Product[];
  analyzedProducts?: ReturnType<typeof rankProducts>;
  product?: ReturnType<typeof rankProducts>[number];
  content?: ContentPackage;
  qc?: QCResult;
  error?: string;
}

export function createWorkflow(goal: string): WorkflowContext {
  return { goal: goal.trim(), status: "idle" };
}

export async function runWorkflow(context: WorkflowContext): Promise<WorkflowContext> {
  if (!context.goal) throw new Error("Workflow goal is required.");
  context.status = "running";

  try {
    console.log("");
    console.log("=== COMMERCA WORKFLOW ===");
    console.log(`Goal: ${context.goal}`);
    console.log("");

    console.log("[1/5] Product Discovery");
    const provider = new ShopeeProvider();
    const discovered = await provider.search(context.goal);
    if (!discovered.length) throw new Error("Product discovery returned 0 products.");
    context.discoveredProducts = discovered;
    console.log(`  Found: ${discovered.length} products`);

    console.log("[2/5] Product Analysis");
    const ranked = rankProducts(discovered);
    context.analyzedProducts = ranked;
    console.log(`  Analyzed: ${ranked.length} products`);

    console.log("[3/5] Product Selection");
    const selected = ranked[0];
    if (!selected) throw new Error("No product passed selection.");
    context.product = selected;
    console.log(`  Selected: ${selected.product.name}`);
    console.log(`  Score: ${selected.score}/100`);

    console.log("[4/5] Content Generation");
    context.content = generateContent(selected);
    console.log(`  Generated: ${context.content.title}`);

    console.log("[5/5] Content QC");
    context.qc = runContentQC(selected.product, context.content);
    console.log(`  QC: ${context.qc.passed ? "PASS" : "FAIL"} (${context.qc.score}/100)`);
    if (context.qc.errors.length) {
      console.log(`  Errors: ${context.qc.errors.join("; ")}`);
    }
    if (context.qc.warnings.length) {
      console.log(`  Warnings: ${context.qc.warnings.join("; ")}`);
    }

    if (!context.qc.passed) throw new Error("Workflow stopped because Content QC failed.");
    context.status = "completed";
    console.log("");
    console.log("Workflow completed successfully.");
    console.log("");
    return context;
  } catch (error) {
    context.status = "failed";
    context.error = error instanceof Error ? error.message : String(error);
    console.error(`Workflow failed: ${context.error}`);
    return context;
  }
}
