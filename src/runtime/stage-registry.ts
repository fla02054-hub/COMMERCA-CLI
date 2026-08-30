import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { WORKFLOW_STAGES } from "./workflow-schema.js";
import { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
import type { StageContext, StageResult } from "./stage-contract.js";
import { MarketResearchRegistry, ProductDataMarketResearchProvider } from "../market/registry.js";
import { generateContent } from "../content/index.js";
import { generateContentWithGemini } from "../ai/gemini.js";
import { buildCreativeStrategy } from "../creative/index.js";
import { produceCreative } from "../production/index.js";
import { readShopeeProductDetail, rankProducts, scoreProducts } from "../product/index.js";
import type { Product } from "../product/types.js";
import type { CreativeStrategy, ProductionPackage, FinalContentPackage, QcReport, PublicationRecord, PerformanceReport, DecisionLearning } from "./stage-artifacts.js";

function marketRegistry(): MarketResearchRegistry {
  const registry = new MarketResearchRegistry();
  registry.register(new ProductDataMarketResearchProvider());
  return registry;
}
function latest<T>(context: StageContext, type: string): T | undefined {
  return [...context.artifacts].reverse().find((item) => item.type === type)?.data as T | undefined;
}

/**
 * The direct product input is the authoritative product identity for a run.
 * Providers may enrich it, but they must never replace the user-selected
 * product name, id, URL, or supplied media with another product.
 */
function preserveDirectProduct(input: Product, enrichment: Partial<Product>): Product {
  return {
    ...enrichment,
    ...input,
    id: input.id,
    name: input.name,
    url: input.url,
    image: input.image ?? enrichment.image,
    images: input.images?.length ? input.images : enrichment.images ?? (enrichment.image ? [enrichment.image] : []),
  };
}

export interface StageRegistryOptions {
  product?: Product;
  researchProduct?: (product: Product) => Promise<Product>;
  marketResearch?: (input: { productId?: string; productName: string; query: string; product?: Product }) => ReturnType<MarketResearchRegistry["research"]>;
  production?: (creative: CreativeStrategy) => Promise<ProductionPackage>;
}

function finalVideoPath(production: ProductionPackage): string | undefined {
  const editing = production.editing;
  if (editing && typeof editing === "object" && "finalMp4" in editing && typeof (editing as { finalMp4?: unknown }).finalMp4 === "string") return (editing as { finalMp4: string }).finalMp4;
  const video = production.video;
  if (video && typeof video === "object" && "path" in video && typeof (video as { path?: unknown }).path === "string") return (video as { path: string }).path;
  if (typeof video === "string") return video;
  return undefined;
}

export function createStageRegistry(options: StageRegistryOptions = {}): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();
  const live = process.env.COMMERCA_MODE === "live";
  registry.register(new FunctionStage("goal", async (c) => ({ artifacts: [artifact("goal", "goal", { text: c.goal })] })));

  registry.register(new FunctionStage("product-input", async () => {
    const product = options.product;
    const images = product?.images?.filter(Boolean) ?? (product?.image ? [product.image] : []);
    if (!product?.name || typeof product.price !== "number" || !product.url || images.length === 0) throw new Error("Manual product input requires name, price, url and at least one image.");
    return { artifacts: [artifact("product-input", "product-input", { ...product, image: product.image ?? images[0], images })] } satisfies StageResult;
  }));
  registry.register(new FunctionStage("product-research", async (c) => {
    const product = latest<Product>(c, "product-input");
    if (!product) throw new Error("Product research requires manual product input.");
    const researcher = options.researchProduct ?? (live ? async (item: Product) => {
      if (!item.url) return item;
      const detail = await readShopeeProductDetail(item.url);
      return preserveDirectProduct(item, detail);
    } : async (item: Product) => item);
    try {
      const researched = preserveDirectProduct(product, await researcher(product));
      return { artifacts: [artifact("product-research", "product-profile", { products: [researched], researchErrors: [] })] };
    }
    catch (error) { if (live) throw error; return { artifacts: [artifact("product-research", "product-profile", { products: [product], researchErrors: [{ productId: product.id, error: error instanceof Error ? error.message : String(error) }] })] }; }
  }));
  registry.register(new FunctionStage("market-research", async (c) => {
    const profile = latest<{ products: Product[] }>(c, "product-profile"); const product = profile?.products?.[0];
    if (!product) throw new Error("Market research requires researched product.");
    const evidence = await (options.marketResearch ? options.marketResearch({ productId: product.id, productName: product.name, query: c.goal, product }) : marketRegistry().research({ productId: product.id, productName: product.name, query: c.goal, product }));
    return { artifacts: [artifact("market-research", "market-evidence", { productId: product.id, productName: product.name, evidence })] };
  }));
  registry.register(new FunctionStage("product-analysis", async (c) => {
    const products = latest<{ products: Product[] }>(c, "product-profile")?.products ?? []; if (!products.length) throw new Error("Product analysis requires researched products.");
    const analysis = rankProducts(products); const market = latest<{ evidence?: unknown }>(c, "market-evidence")?.evidence;
    return { artifacts: [artifact("product-analysis", "product-analysis", analysis.map((item) => ({ ...item, marketEvidence: market ?? null })))] };
  }));
  registry.register(new FunctionStage("product-scoring", async (c) => {
    const analysis = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? []; if (!analysis.length) throw new Error("Product scoring requires analysis.");
    return { artifacts: [artifact("product-scoring", "scorecard", scoreProducts(analysis))] };
  }));
  registry.register(new FunctionStage("product-selection", async (c) => {
    const scored = latest<Array<{ productId: string; score: number }>>(c, "scorecard") ?? []; const selected = [...scored].sort((a, b) => b.score - a.score)[0];
    if (!selected) throw new Error("No product passed selection."); const analysis = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? []; const selectedAnalysis = analysis.find((item) => item.product.id === selected.productId);
    if (!selectedAnalysis) throw new Error("Selected product analysis is missing."); return { artifacts: [artifact("product-selection", "selection", selectedAnalysis)] };
  }));
  registry.register(new FunctionStage("content-strategy", async (c) => {
    const selected = latest<{ product?: Product }>(c, "selection"); if (!selected?.product) throw new Error("Content strategy requires selection.");
    const analysis = rankProducts([selected.product])[0]; if (!analysis) throw new Error("Content strategy requires product analysis.");
    const content = live || process.env.COMMERCA_USE_GEMINI === "1" ? await generateContentWithGemini(analysis) : generateContent(analysis);
    const productUrl = selected.product.url; if (!productUrl) throw new Error("Product URL is required for publishing.");
    return { artifacts: [artifact("content-strategy", "content-package", { ...content, productUrl, caption: content.caption.includes(productUrl) ? content.caption : `${content.caption}\n\n🔗 ${productUrl}` })] };
  });
  registry.register(new FunctionStage("creative-strategy", async (c) => {
    const content = latest<any>(c, "content-package"); if (!content) throw new Error("Creative strategy requires content package.");
    return { artifacts: [artifact("creative-strategy", "creative-strategy", buildCreativeStrategy(content))] };
  });
  registry.register(new FunctionStage("production", async (c) => {
    const creative = latest<CreativeStrategy>(c, "creative-strategy"); if (!creative) throw new Error("Production requires creative strategy.");
    // Production is deliberately delegated to the real production subsystem.
    // The workflow registry must not manufacture a fake final video just to satisfy QC.
    const production = options.production ? await options.production(creative) : await produceCreative(creative);
    return { artifacts: [artifact("production", "production-package", production)] };
  }));
  registry.register(new FunctionStage("qc", async (c) => {
    const production = latest<ProductionPackage>(c, "production-package"); if (!production) throw new Error("QC requires production package.");
    const issues: string[] = []; const videoPath = finalVideoPath(production);
    if (!production.image) issues.push("missing image output");
    if (!videoPath) issues.push("missing final video output");
    if (!production.voice) issues.push("missing voice output");
    if (!production.subtitle) issues.push("missing subtitle output");
    if (videoPath && live) { const { stat } = await import("node:fs/promises"); try { const info = await stat(videoPath); if (info.size < 1000) issues.push("final video file is empty or invalid"); } catch { issues.push("final video file does not exist"); } }
    return { artifacts: [artifact("qc", "qc-report", { passed: issues.length === 0, issues } satisfies QcReport)] };
  }));
  registry.register(new FunctionStage("publishing", async (c) => {
    const qc = latest<QcReport>(c, "qc-report"); if (!qc?.passed) throw new Error(`Publishing blocked: QC failed: ${qc?.issues?.join(", ") ?? "unknown"}`);
    const product = latest<Product>(c, "product-input"); const content = latest<any>(c, "content-package"); const creative = latest<CreativeStrategy>(c, "creative-strategy"); const production = latest<ProductionPackage>(c, "production-package");
    if (!product || !content || !creative || !production) throw new Error("Final content package is incomplete.");
    if (!product.url || !content.productUrl || content.productUrl !== product.url) throw new Error("Publishing blocked: product URL is missing or mismatched.");
    const videoPath = finalVideoPath(production); if (!videoPath) throw new Error("Publishing blocked: final video is missing.");
    const publish = { organic: { status: "ready", platform: "facebook", caption: content.caption, hashtags: content.hashtags, callToAction: content.callToAction, productUrl: product.url, videoPath }, ads: { status: "ready", platform: "meta", videoPath, productUrl: product.url } };
    const finalPackage: FinalContentPackage = { product, content, creative, production: { ...production, video: { path: videoPath } }, qc, publish };
    const outputDir = process.env.COMMERCA_OUTPUT_DIR ?? "./output"; const packagePath = process.env.COMMERCA_OUTPUT_PACKAGE ?? `${outputDir}/final-content-package.json`;
    await mkdir(dirname(packagePath), { recursive: true }); await writeFile(packagePath, JSON.stringify(finalPackage, null, 2), "utf8");
    await writeFile(`${dirname(packagePath)}/post.txt`, `${content.caption}\n\n${content.hashtags.join(" ")}\n\n${content.callToAction}\n🔗 ${product.url}\n`, "utf8");
    return { artifacts: [artifact("publishing", "final-package", finalPackage), artifact("publishing", "publication", publish)] };
  }));
  registry.register(new FunctionStage("performance", async (c) => {
    if (!latest<PublicationRecord>(c, "publication")) throw new Error("Performance requires publication.");
    return { artifacts: [artifact("performance", "performance-report", { reach: 0, ctr: 0, cpc: 0, conversion: 0, commission: 0 } satisfies PerformanceReport)] };
  }));
  registry.register(new FunctionStage("decision-learning", async (c) => {
    if (!latest<PerformanceReport>(c, "performance-report")) throw new Error("Decision requires performance data.");
    return { artifacts: [artifact("decision-learning", "decision", { outcome: "optimize", actions: ["collect real metrics", "re-evaluate product and content"], feedbackStage: "product-research" } satisfies DecisionLearning)] };
  }));
  for (const stage of WORKFLOW_STAGES) if (!registry.has(stage)) throw new Error(`Missing workflow stage handler: ${stage}`);
  return registry;
}