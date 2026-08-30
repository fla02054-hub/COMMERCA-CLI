import { WORKFLOW_STAGES } from "./workflow-schema.js";
import { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
import type { StageContext, StageResult } from "./stage-contract.js";
import { MarketResearchRegistry, FixtureMarketResearchProvider } from "../market/registry.js";
import { generateContent } from "../content/index.js";
import { generateContentWithGemini } from "../ai/gemini.js";
import { buildCreativeStrategy } from "../creative/index.js";
import { produceCreative } from "../production/index.js";
import { rankProducts, scoreProducts } from "../product/index.js";
import type { Product } from "../product/types.js";
import type { CreativeStrategy, ProductionPackage, QcReport, PublicationRecord, PerformanceReport, DecisionLearning } from "./stage-artifacts.js";

function marketRegistry(): MarketResearchRegistry { const registry = new MarketResearchRegistry(); registry.register(new FixtureMarketResearchProvider()); return registry; }
function latest<T>(context: StageContext, type: string): T | undefined { return [...context.artifacts].reverse().find((item) => item.type === type)?.data as T | undefined; }

export interface StageRegistryOptions {
  product?: Product;
  researchProduct?: (product: Product) => Promise<Product>;
  marketResearch?: (input: { productId?: string; productName: string; query: string }) => ReturnType<MarketResearchRegistry["research"]>;
  production?: (creative: CreativeStrategy) => Promise<ProductionPackage>;
}

export function createStageRegistry(options: StageRegistryOptions = {}): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();
  registry.register(new FunctionStage("goal", async (c) => ({ artifacts: [artifact("goal", "goal", { text: c.goal })] })));

  registry.register(new FunctionStage("product-input", async () => {
    const product = options.product;
    const images = product?.images?.filter(Boolean) ?? (product?.image ? [product.image] : []);
    if (!product?.name || typeof product.price !== "number" || !product.url || images.length === 0) {
      throw new Error("Manual product input requires name, price, url and at least one image.");
    }
    const normalizedProduct: Product = { ...product, image: product.image ?? images[0], images };
    return { artifacts: [artifact("product-input", "product-input", normalizedProduct)] } satisfies StageResult;
  }));

  registry.register(new FunctionStage("product-research", async (c) => {
    const product = latest<Product>(c, "product-input");
    if (!product) throw new Error("Product research requires manual product input.");
    const researcher = options.researchProduct ?? (async (item: Product) => item);
    try {
      const researched = await researcher(product);
      return { artifacts: [artifact("product-research", "product-profile", { products: [researched], researchErrors: [] })] };
    } catch (error) {
      return { artifacts: [artifact("product-research", "product-profile", { products: [product], researchErrors: [{ productId: product.id, error: error instanceof Error ? error.message : String(error) }] })] };
    }
  }));

  registry.register(new FunctionStage("market-research", async (c) => { const profile = latest<{ products: Product[] }>(c, "product-profile"); const product = profile?.products?.[0]; if (!product) throw new Error("Market research requires researched product."); const evidence = await (options.marketResearch ? options.marketResearch({ productId: product.id, productName: product.name, query: c.goal }) : marketRegistry().research({ productId: product.id, productName: product.name, query: c.goal })); return { artifacts: [artifact("market-research", "market-evidence", { productId: product.id, productName: product.name, evidence })] }; }));
  registry.register(new FunctionStage("product-analysis", async (c) => { const products = latest<{ products: Product[] }>(c, "product-profile")?.products ?? []; if (!products.length) throw new Error("Product analysis requires researched products."); const analysis = rankProducts(products); const market = latest<{ evidence?: unknown }>(c, "market-evidence")?.evidence; return { artifacts: [artifact("product-analysis", "product-analysis", analysis.map((item) => ({ ...item, marketEvidence: market ?? null })))] }; }));
  registry.register(new FunctionStage("product-scoring", async (c) => { const analysis = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? []; if (!analysis.length) throw new Error("Product scoring requires analysis."); return { artifacts: [artifact("product-scoring", "scorecard", scoreProducts(analysis))] }; }));
  registry.register(new FunctionStage("product-selection", async (c) => { const scored = latest<Array<{ productId: string; score: number }>>(c, "scorecard") ?? []; const selected = [...scored].sort((a, b) => b.score - a.score)[0]; if (!selected) throw new Error("No product passed selection."); const analysis = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? []; const selectedAnalysis = analysis.find((item) => item.product.id === selected.productId); if (!selectedAnalysis) throw new Error("Selected product analysis is missing."); return { artifacts: [artifact("product-selection", "selection", selectedAnalysis)] }; }));
  registry.register(new FunctionStage("content-strategy", async (c) => { const selected = latest<{ product?: Product }>(c, "selection"); if (!selected?.product) throw new Error("Content strategy requires selection."); const analysis = rankProducts([selected.product])[0]; const content = process.env.COMMERCA_USE_GEMINI === "1" ? await generateContentWithGemini(analysis) : generateContent(analysis); return { artifacts: [artifact("content-strategy", "content-package", content)] }; }));
  registry.register(new FunctionStage("creative-strategy", async (c) => { const content = latest<any>(c, "content-package"); if (!content) throw new Error("Creative strategy requires content package."); return { artifacts: [artifact("creative-strategy", "creative-strategy", buildCreativeStrategy(content))] }; }));
  registry.register(new FunctionStage("production", async (c) => { const creative = latest<CreativeStrategy>(c, "creative-strategy"); if (!creative) throw new Error("Production requires creative strategy."); const production = options.production ? await options.production(creative) : await produceCreative(creative); return { artifacts: [artifact("production", "production-package", production)] }; });
  registry.register(new FunctionStage("qc", async (c) => { const production = latest<ProductionPackage>(c, "production-package"); if (!production) throw new Error("QC requires production package."); const issues: string[] = []; if (!production.image) issues.push("missing image output"); if (!production.video) issues.push("missing video output"); if (!production.voice) issues.push("missing voice output"); if (!production.subtitle) issues.push("missing subtitle output"); return { artifacts: [artifact("qc", "qc-report", { passed: issues.length === 0, issues } satisfies QcReport)] }; }));
  registry.register(new FunctionStage("publishing", async (c) => { const qc = latest<QcReport>(c, "qc-report"); if (!qc?.passed) throw new Error("Publishing blocked: QC did not pass."); return { artifacts: [artifact("publishing", "publication", { organic: { status: "ready" }, ads: { status: "ready" } } satisfies PublicationRecord)] }; }));
  registry.register(new FunctionStage("performance", async (c) => { if (!latest<PublicationRecord>(c, "publication")) throw new Error("Performance requires publication."); return { artifacts: [artifact("performance", "performance-report", { reach: 0, ctr: 0, cpc: 0, conversion: 0, commission: 0 } satisfies PerformanceReport)] }; }));
  registry.register(new FunctionStage("decision-learning", async (c) => { if (!latest<PerformanceReport>(c, "performance-report")) throw new Error("Decision requires performance data."); return { artifacts: [artifact("decision-learning", "decision", { outcome: "optimize", actions: ["collect real metrics", "re-evaluate product and content"], feedbackStage: "product-research" } satisfies DecisionLearning)] }; }));
  for (const stage of WORKFLOW_STAGES) if (!registry.has(stage)) throw new Error(`Missing workflow stage handler: ${stage}`);
  return registry;
}
