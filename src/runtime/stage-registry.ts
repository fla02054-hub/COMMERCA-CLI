import { WORKFLOW_STAGES } from "./workflow-schema.js";
import { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
import type { StageContext } from "./stage-contract.js";
import { ProductProviderRegistry, ShopeeBrowserProvider, RakatookyangProvider, rankProducts } from "../product/index.js";
import { generateContent } from "../content/index.js";

function productRegistry(): ProductProviderRegistry {
  const registry = new ProductProviderRegistry();
  registry.register(new ShopeeBrowserProvider());
  registry.register(new RakatookyangProvider());
  return registry;
}

function latest<T>(context: StageContext, type: string): T | undefined {
  return [...context.artifacts].reverse().find((item) => item.type === type)?.data as T | undefined;
}

export function createStageRegistry(): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();

  registry.register(new FunctionStage("goal", async (context) => ({
    artifacts: [artifact("goal", "goal", { text: context.goal })],
  })));

  registry.register(new FunctionStage("product-discovery", async (context) => {
    const results = await productRegistry().get("shopee-browser").search(context.goal);
    return { artifacts: [artifact("product-discovery", "product-candidate-list", results)] };
  }));

  registry.register(new FunctionStage("product-research", async (context) => {
    const products = latest<unknown[]>(context, "product-candidate-list") ?? [];
    return { artifacts: [artifact("product-research", "product-profile", products)] };
  }));

  registry.register(new FunctionStage("market-research", async (context) => ({
    artifacts: [artifact("market-research", "market-evidence", { status: "pending-provider", goal: context.goal })],
  })));

  registry.register(new FunctionStage("product-analysis", async (context) => {
    const products = latest<Parameters<typeof rankProducts>[0]>(context, "product-profile") ?? [];
    return { artifacts: [artifact("product-analysis", "product-analysis", rankProducts(products))] };
  }));

  registry.register(new FunctionStage("product-scoring", async (context) => {
    const analysis = latest<unknown[]>(context, "product-analysis") ?? [];
    return { artifacts: [artifact("product-scoring", "scorecard", analysis)] };
  }));

  registry.register(new FunctionStage("product-selection", async (context) => {
    const scored = latest<Array<{ product: unknown; score: number }>>(context, "scorecard") ?? [];
    const selected = [...scored].sort((a, b) => b.score - a.score)[0];
    return { artifacts: [artifact("product-selection", "selection", selected ?? null)] };
  }));

  registry.register(new FunctionStage("content-strategy", async (context) => {
    const selected = latest<{ product?: Parameters<typeof rankProducts>[0][number] }>(context, "selection");
    const analysis = selected?.product ? rankProducts([selected.product])[0] : undefined;
    if (!analysis) return { artifacts: [artifact("content-strategy", "content-strategy", { status: "blocked", reason: "no selected product" })] };
    return { artifacts: [artifact("content-strategy", "content-package", generateContent(analysis))] };
  }));

  for (const stage of WORKFLOW_STAGES.filter((item) => !registry.has(item))) {
    registry.register(new FunctionStage(stage, async () => ({
      artifacts: [artifact(stage, `${stage}-placeholder`, { status: "not-implemented" })],
    })));
  }

  return registry;
}
