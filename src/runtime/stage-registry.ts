import { WORKFLOW_STAGES } from "./workflow-schema.js";
import { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
import type { StageContext } from "./stage-contract.js";
import { ProductProviderRegistry, ShopeeBrowserProvider, RakatookyangProvider, rankProducts } from "../product/index.js";
import { generateContent } from "../content/index.js";
import type { Product } from "../product/types.js";
import type { CreativeStrategy, ProductionPackage, QcReport, PublicationRecord, PerformanceReport, DecisionLearning } from "./stage-artifacts.js";

function productRegistry(): ProductProviderRegistry {
  const registry = new ProductProviderRegistry();
  registry.register(new ShopeeBrowserProvider());
  registry.register(new RakatookyangProvider());
  return registry;
}
function latest<T>(context: StageContext, type: string): T | undefined {
  return [...context.artifacts].reverse().find((item) => item.type === type)?.data as T | undefined;
}
export interface StageRegistryOptions { discoverProducts?: (goal: string) => Promise<Product[]>; }

export function createStageRegistry(options: StageRegistryOptions = {}): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();
  registry.register(new FunctionStage("goal", async (c) => ({ artifacts: [artifact("goal", "goal", { text: c.goal })] })));
  registry.register(new FunctionStage("product-discovery", async (c) => {
    const results = options.discoverProducts ? await options.discoverProducts(c.goal) : await productRegistry().get("shopee-browser")!.search(c.goal);
    if (!results.length) throw new Error("Product discovery returned 0 products.");
    return { artifacts: [artifact("product-discovery", "product-candidate-list", results)] };
  }));
  registry.register(new FunctionStage("product-research", async (c) => {
    const products = latest<Product[]>(c, "product-candidate-list") ?? [];
    if (!products.length) throw new Error("Product research requires candidates.");
    return { artifacts: [artifact("product-research", "product-profile", products)] };
  }));
  registry.register(new FunctionStage("market-research", async (c) => ({ artifacts: [artifact("market-research", "market-evidence", { status: "pending-provider", goal: c.goal })] })));
  registry.register(new FunctionStage("product-analysis", async (c) => {
    const products = latest<Product[]>(c, "product-profile") ?? [];
    if (!products.length) throw new Error("Product analysis requires researched products.");
    return { artifacts: [artifact("product-analysis", "product-analysis", rankProducts(products))] };
  }));
  registry.register(new FunctionStage("product-scoring", async (c) => {
    const analysis = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? [];
    if (!analysis.length) throw new Error("Product scoring requires analysis.");
    return { artifacts: [artifact("product-scoring", "scorecard", analysis)] };
  }));
  registry.register(new FunctionStage("product-selection", async (c) => {
    const scored = latest<ReturnType<typeof rankProducts>>(c, "scorecard") ?? [];
    const selected = [...scored].sort((a, b) => b.score - a.score)[0];
    if (!selected) throw new Error("No product passed selection.");
    return { artifacts: [artifact("product-selection", "selection", selected)] };
  }));
  registry.register(new FunctionStage("content-strategy", async (c) => {
    const selected = latest<ReturnType<typeof rankProducts>[number]>(c, "selection");
    if (!selected) throw new Error("Content strategy requires selection.");
    return { artifacts: [artifact("content-strategy", "content-package", generateContent(selected))] };
  }));
  registry.register(new FunctionStage("creative-strategy", async (c) => {
    const content = latest<Record<string, unknown>>(c, "content-package");
    if (!content) throw new Error("Creative strategy requires content.");
    const result: CreativeStrategy = { image: ["product hero"], video: ["short product demonstration"], storyboard: ["hook", "problem", "product", "proof", "CTA"], prompt: [JSON.stringify({ content, format: "9:16" })] };
    return { artifacts: [artifact("creative-strategy", "creative-strategy", result)] };
  }));
  registry.register(new FunctionStage("production", async (c) => {
    const creative = latest<CreativeStrategy>(c, "creative-strategy");
    if (!creative) throw new Error("Production requires creative strategy.");
    const result: ProductionPackage = { image: creative.image, video: creative.video, editing: creative.storyboard };
    return { artifacts: [artifact("production", "production-package", result)] };
  }));
  registry.register(new FunctionStage("qc", async (c) => {
    const production = latest<ProductionPackage>(c, "production-package");
    if (!production) throw new Error("QC requires production package.");
    return { artifacts: [artifact("qc", "qc-report", { passed: true, issues: [] } satisfies QcReport)] };
  }));
  registry.register(new FunctionStage("publishing", async (c) => {
    const qc = latest<QcReport>(c, "qc-report");
    if (!qc?.passed) throw new Error("Publishing blocked: QC did not pass.");
    return { artifacts: [artifact("publishing", "publication", { organic: { status: "ready" }, ads: { status: "ready" } } satisfies PublicationRecord)] };
  }));
  registry.register(new FunctionStage("performance", async (c) => {
    if (!latest<PublicationRecord>(c, "publication")) throw new Error("Performance requires publication.");
    return { artifacts: [artifact("performance", "performance-report", { reach: 0, ctr: 0, cpc: 0, conversion: 0, commission: 0 } satisfies PerformanceReport)] };
  }));
  registry.register(new FunctionStage("decision-learning", async (c) => {
    if (!latest<PerformanceReport>(c, "performance-report")) throw new Error("Decision requires performance data.");
    const result: DecisionLearning = { outcome: "optimize", actions: ["collect real metrics", "re-evaluate product and content"], feedbackStage: "product-research" };
    return { artifacts: [artifact("decision-learning", "decision", result)] };
  }));
  for (const stage of WORKFLOW_STAGES) if (!registry.has(stage)) throw new Error(`Missing workflow stage handler: ${stage}`);
  return registry;
}
