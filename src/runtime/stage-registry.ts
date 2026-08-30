import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WORKFLOW_STAGES } from "./workflow-schema.js";
import { WorkflowStageRegistry, FunctionStage, artifact } from "./stages.js";
import type { StageContext } from "./stage-contract.js";
import { generateContent } from "../content/index.js";
import { generateContentWithGemini } from "../ai/gemini.js";
import { buildCreativeStrategy, validateCreativeStrategy } from "../creative/index.js";
import { produceCreative } from "../production/index.js";
import { publishToFacebookPage } from "../publishing/facebook.js";
import { rankProducts, scoreProducts } from "../product/index.js";
import type { Product } from "../product/types.js";
import type { ContentPackage } from "../content/index.js";
import type { CreativeStrategy, ProductionPackage, FinalContentPackage, QcReport, PublicationRecord, PerformanceReport } from "./stage-artifacts.js";

function latest<T>(context: StageContext, type: string): T | undefined { return [...context.artifacts].reverse().find((item) => item.type === type)?.data as T | undefined; }
export interface StageRegistryOptions { product?: Product; outputDir?: string; outputMp4?: string; production?: (creative: CreativeStrategy) => Promise<ProductionPackage>; }
function finalVideoPath(production: ProductionPackage): string | undefined {
  const e = production.editing;
  if (e && typeof e === "object" && "finalMp4" in e && typeof (e as any).finalMp4 === "string") return (e as any).finalMp4;
  const v = production.video;
  if (v && typeof v === "object" && "path" in v && typeof (v as any).path === "string") return (v as any).path;
  return typeof v === "string" ? v : undefined;
}
function contentIntegrity(product: Product, content: ContentPackage): string[] {
  const issues: string[] = [];
  if (!content.title || content.title.length > 70) issues.push("content title is missing or too long");
  if (!content.hook || content.hook.length > 180) issues.push("content hook is missing or too long");
  if (!content.body || content.body.length > 900) issues.push("content body is missing or too long");
  if (!content.caption || content.caption.length > 1200) issues.push("publish caption is missing or too long");
  if (content.caption.includes(product.url ?? "__NO_URL__")) issues.push("publish caption must not contain product URL");
  if (content.firstComment !== `🛒 พิกัดสินค้า 👇\n🔗 ${product.url}`) issues.push("first comment URL does not match selected product");
  if (!content.hashtags.length || content.hashtags.length > 5) issues.push("hashtags must contain 1-5 tags");
  if (content.hashtags.some((tag) => !/^#[^\s#]{2,40}$/.test(tag))) issues.push("hashtag format is invalid");
  if (content.voiceScript?.length !== 5) issues.push("voice script must contain exactly 5 lines");
  if (content.subtitleScript?.length !== 5) issues.push("subtitle script must contain exactly 5 lines");
  return issues;
}
export function createStageRegistry(options: StageRegistryOptions = {}): WorkflowStageRegistry {
  const registry = new WorkflowStageRegistry();
  const live = process.env.COMMERCA_MODE === "live";
  registry.register(new FunctionStage("goal", async c => ({ artifacts: [artifact("goal", "goal", { text: c.goal })] })));
  registry.register(new FunctionStage("product-input", async () => {
    const p = options.product;
    const images = p?.images?.filter(Boolean) ?? (p?.image ? [p.image] : []);
    if (!p?.name || typeof p.price !== "number" || !p.url || !images.length) throw new Error("Manual product input requires name, price, url and at least one image.");
    return { artifacts: [artifact("product-input", "product-input", { ...p, image: p.image ?? images[0], images })] };
  }));
  registry.register(new FunctionStage("product-analysis", async c => {
    const p = latest<Product>(c, "product-input");
    if (!p) throw new Error("Product analysis requires manual product input.");
    return { artifacts: [artifact("product-analysis", "product-analysis", rankProducts([p]))] };
  }));
  registry.register(new FunctionStage("product-scoring", async c => {
    const a = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? [];
    if (!a.length) throw new Error("Product scoring requires analysis.");
    return { artifacts: [artifact("product-scoring", "scorecard", scoreProducts(a))] };
  }));
  registry.register(new FunctionStage("product-selection", async c => {
    const s = latest<Array<{ productId: string; score: number }>>(c, "scorecard") ?? [];
    const best = [...s].sort((a, b) => b.score - a.score)[0];
    if (!best) throw new Error("No product passed selection.");
    const a = latest<ReturnType<typeof rankProducts>>(c, "product-analysis") ?? [];
    const selected = a.find(x => x.product.id === best.productId);
    if (!selected) throw new Error("Selected product analysis is missing.");
    return { artifacts: [artifact("product-selection", "selection", selected)] };
  }));
  registry.register(new FunctionStage("content-strategy", async c => {
    const s = latest<{ product?: Product }>(c, "selection");
    if (!s?.product) throw new Error("Content strategy requires selection.");
    const a = rankProducts([s.product])[0];
    if (!a) throw new Error("Product analysis missing.");
    const content = live || process.env.COMMERCA_USE_GEMINI === "1" ? await generateContentWithGemini(a) : generateContent(a);
    const url = s.product.url;
    if (!url) throw new Error("Product URL is required for publishing.");
    if (content.productUrl !== url) throw new Error("Generated content URL does not match selected product.");
    return { artifacts: [artifact("content-strategy", "content-package", content)] };
  }));
  registry.register(new FunctionStage("creative-strategy", async c => {
    const content = latest<ContentPackage>(c, "content-package");
    if (!content) throw new Error("Creative strategy requires content package.");
    const creative = buildCreativeStrategy(content);
    const issues = validateCreativeStrategy(creative);
    if (issues.length) throw new Error(`Creative strategy validation failed: ${issues.join("; ")}`);
    return { artifacts: [artifact("creative-strategy", "creative-strategy", creative)] };
  }));
  registry.register(new FunctionStage("production", async c => {
    const creative = latest<CreativeStrategy>(c, "creative-strategy");
    if (!creative) throw new Error("Production requires creative strategy.");
    return { artifacts: [artifact("production", "production-package", options.production ? await options.production(creative) : await produceCreative(creative, { outputDir: options.outputDir, outputMp4: options.outputMp4 }))] };
  }));
  registry.register(new FunctionStage("qc", async c => {
    const p = latest<Product>(c, "product-input");
    const content = latest<ContentPackage>(c, "content-package");
    const creative = latest<CreativeStrategy>(c, "creative-strategy");
    const production = latest<ProductionPackage>(c, "production-package");
    const issues: string[] = [];
    if (!p || !content || !creative || !production) issues.push("final package inputs are incomplete");
    if (p && content) { if (content.productUrl !== p.url) issues.push("product URL mismatch"); issues.push(...contentIntegrity(p, content)); }
    if (creative) issues.push(...validateCreativeStrategy(creative));
    const v = production ? finalVideoPath(production) : undefined;
    if (!production?.image) issues.push("missing image output");
    if (!v) issues.push("missing final video output");
    if (!production?.voice) issues.push("missing voice output");
    if (!production?.subtitle) issues.push("missing subtitle output");
    if (v) { try { if ((await stat(v)).size < 1000) issues.push("final video file is empty or invalid"); } catch { if (live) issues.push("final video file does not exist"); } }
    return { artifacts: [artifact("qc", "qc-report", { passed: issues.length === 0, issues } satisfies QcReport)] };
  }));
  registry.register(new FunctionStage("publishing", async c => {
    const qc = latest<QcReport>(c, "qc-report");
    if (!qc?.passed) throw new Error(`Publishing blocked: QC failed: ${qc?.issues?.join(", ") ?? "unknown"}`);
    const p = latest<Product>(c, "product-input");
    const content = latest<ContentPackage>(c, "content-package");
    const creative = latest<CreativeStrategy>(c, "creative-strategy");
    const prod = latest<ProductionPackage>(c, "production-package");
    if (!p || !content || !creative || !prod) throw new Error("Final content package is incomplete.");
    if (!p.url || content.productUrl !== p.url) throw new Error("Publishing blocked: product URL is missing or mismatched.");
    const videoPath = finalVideoPath(prod);
    if (!videoPath) throw new Error("Publishing blocked: final video is missing.");
    const firstComment = content.firstComment ?? `🛒 พิกัดสินค้า 👇\n🔗 ${p.url}`;
    const organic: Record<string, unknown> = { status: live ? "publishing" : "ready", platform: "facebook", caption: content.caption, hashtags: content.hashtags, callToAction: content.callToAction, productUrl: p.url, firstComment, videoPath };
    let publishedOrganic = organic;
    if (live) { const result = await publishToFacebookPage({ videoPath, caption: content.caption }); publishedOrganic = { ...organic, status: "published", provider: result.provider, postId: result.id, permalink: result.permalink }; }
    const publish = { organic: publishedOrganic, ads: { status: "ready", platform: "meta", videoPath, productUrl: p.url } };
    const finalPackage: FinalContentPackage = { product: p, content: { ...content, firstComment }, creative, production: { ...prod, video: { path: videoPath } }, qc, publish };
    const dir = options.outputDir ?? process.env.COMMERCA_OUTPUT_DIR ?? "./output";
    const path = options.outputMp4 ? join(dirname(options.outputMp4), "final-content-package.json") : `${dir}/final-content-package.json`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(finalPackage, null, 2), "utf8");
    await writeFile(`${dirname(path)}/post.txt`, `${content.caption}\n\n${firstComment}\n`, "utf8");
    return { artifacts: [artifact("publishing", "final-package", finalPackage), artifact("publishing", "publication", publish)] };
  }));
  registry.register(new FunctionStage("performance", async c => {
    if (!latest<PublicationRecord>(c, "publication")) throw new Error("Performance requires publication.");
    return { artifacts: [artifact("performance", "performance-report", { reach: 0, ctr: 0, cpc: 0, conversion: 0, commission: 0 } satisfies PerformanceReport)] };
  }));
  registry.register(new FunctionStage("decision-learning", async c => {
    if (!latest<PerformanceReport>(c, "performance-report")) throw new Error("Decision requires performance data.");
    return { artifacts: [artifact("decision-learning", "decision", { outcome: "optimize", actions: ["collect real metrics", "re-evaluate product and content"] })] };
  }));
  for (const stage of WORKFLOW_STAGES) if (!registry.has(stage)) throw new Error(`Missing workflow stage handler: ${stage}`);
  return registry;
}
