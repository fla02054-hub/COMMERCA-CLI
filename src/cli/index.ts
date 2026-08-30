import { runWorkflowWithProduct } from "../runtime/index.js";
import { createStageRegistry } from "../runtime/stage-registry.js";
import { executeWorkflow, type RuntimeWorkflow } from "../runtime/flow.js";
import type { Product } from "../product/types.js";
import { configureUtf8Console } from "./encoding.js";
import { loadJob, saveJob, type JobRecord } from "../jobs/store.js";

configureUtf8Console();
const args = process.argv.slice(2);

function valueAfter(flag: string): string | undefined { const i = args.indexOf(flag); const v = i < 0 ? undefined : args[i + 1]; return v && !v.startsWith("--") ? v : undefined; }
function valuesAfter(flag: string): string[] { const i = args.indexOf(flag); if (i < 0) return []; const out: string[] = []; for (const v of args.slice(i + 1)) { if (v.startsWith("--")) break; out.push(v); } return out; }
function price(v: string | undefined, label: string): number | undefined { if (v === undefined) return; const n = Number(v.replace(/,/g, "")); if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a valid non-negative number.`); return n; }
function id(prefix: string): string { const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14); return `${prefix}-${timestamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }
function latestArtifact<T>(workflow: RuntimeWorkflow, type: string): T | undefined { return [...workflow.artifacts].reverse().find((a) => a.type === type)?.data as T | undefined; }
function usage(): void {
  console.log("COMMERCA-CLI");
  console.log("");
  console.log("  workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
  console.log("  workflow edit --job-id <JOB-ID> [--caption <caption>] [--sub-id <sub-id>]");
  console.log("  workflow approve --job-id <JOB-ID> [--caption <caption>] [--sub-id <sub-id>]");
}
function applyEdits(job: JobRecord, caption?: string, subId?: string): void {
  const product = latestArtifact<Product>(job.workflow, "product-input");
  const content = latestArtifact<any>(job.workflow, "content-package");
  if (subId) {
    if (!product) throw new Error("Job product is missing.");
    product.subId = subId;
    const selection = latestArtifact<any>(job.workflow, "selection");
    if (selection?.product) selection.product.subId = subId;
    job.edits = { ...(job.edits ?? {}), subId };
  }
  if (caption !== undefined) {
    if (!content) throw new Error("Job content package is missing.");
    content.caption = caption;
    job.edits = { ...(job.edits ?? {}), caption };
  }
  job.updatedAt = new Date().toISOString();
}
async function runNewJob(): Promise<void> {
  const name = valueAfter("--product");
  const special = price(valueAfter("--price"), "Special price");
  const original = price(valueAfter("--original-price"), "Original price");
  const url = valueAfter("--url");
  const image = valueAfter("--image");
  const extra = valuesAfter("--images");
  if (!name || special === undefined || original === undefined || !url || !image) throw new Error("usage: workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
  if (original < special) throw new Error("Original price cannot be lower than the special price.");

  const jobId = id("JOB");
  const subId = id("SUB");
  const images = [...new Set([image, ...extra].filter(Boolean))];
  const product: Product = { id: `manual-${crypto.randomUUID()}`, name, price: special, originalPrice: original, discount: original > 0 ? Math.round(((original - special) / original) * 100) : 0, promotion: original !== special ? `ลดเหลือ ฿${special.toLocaleString("th-TH")} จากราคาปกติ ฿${original.toLocaleString("th-TH")}` : undefined, url, image, images, subId, source: "manual", discoveredAt: new Date().toISOString() };

  console.log("COMMERCA-CLI");
  console.log(`JOB ID: ${jobId}`);
  console.log(`SUB ID: ${subId}`);
  console.log(`PRODUCT: ${name}`);
  console.log("");

  const workflow = await runWorkflowWithProduct(name, product, { stopAfterQc: true });
  const status: JobRecord["status"] = workflow.state.status === "awaiting_approval" ? "awaiting-approval" : workflow.state.status === "failed" ? "failed" : "published";
  const job: JobRecord = { jobId, subId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status, workflow };
  await saveJob(job);

  if (workflow.state.status === "awaiting_approval") {
    console.log("QC PASSED — workflow stopped for approval.");
    console.log(`JOB FILE: ${process.env.COMMERCA_JOBS_DIR ?? "./output/jobs"}/${jobId}.json`);
    console.log("");
    console.log(`แก้ไข: npm run dev -- workflow edit --job-id ${jobId} --caption \"ข้อความใหม่\" --sub-id \"${subId}\"`);
    console.log(`อนุมัติโพสต์: npm run dev -- workflow approve --job-id ${jobId}`);
    return;
  }
  console.log(JSON.stringify({ jobId, subId, workflow }, null, 2));
  if (workflow.state.status === "failed") process.exit(1);
}
async function editJob(): Promise<void> {
  const jobId = valueAfter("--job-id");
  if (!jobId) throw new Error("--job-id is required.");
  const job = await loadJob(jobId);
  if (job.status !== "awaiting-approval") throw new Error(`Job ${jobId} is not waiting for approval.`);
  applyEdits(job, valueAfter("--caption"), valueAfter("--sub-id"));
  await saveJob(job);
  console.log(`JOB ${jobId} updated.`);
  console.log(`SUB ID: ${latestArtifact<Product>(job.workflow, "product-input")?.subId ?? job.subId}`);
  console.log(`อนุมัติโพสต์: npm run dev -- workflow approve --job-id ${jobId}`);
}
async function approveJob(): Promise<void> {
  const jobId = valueAfter("--job-id");
  if (!jobId) throw new Error("--job-id is required.");
  const job = await loadJob(jobId);
  if (job.status !== "awaiting-approval") throw new Error(`Job ${jobId} is not waiting for approval.`);
  applyEdits(job, valueAfter("--caption"), valueAfter("--sub-id"));
  job.workflow.state.status = "running";
  job.workflow.state.currentStage = "publishing";
  const publishingState = job.workflow.state.stages.find((s) => s.stage === "publishing");
  if (!publishingState) throw new Error("Publishing stage is missing.");
  publishingState.status = "pending";
  delete publishingState.error;
  const product = latestArtifact<Product>(job.workflow, "product-input");
  if (!product) throw new Error("Job product is missing.");
  const workflow = await executeWorkflow(job.workflow, createStageRegistry({ product }));
  job.workflow = workflow;
  job.status = workflow.state.status === "completed" ? "published" : "failed";
  job.updatedAt = new Date().toISOString();
  await saveJob(job);
  console.log(JSON.stringify({ jobId, subId: product.subId, workflow }, null, 2));
  if (workflow.state.status === "failed") process.exit(1);
}
async function main(): Promise<void> {
  if (args[0] !== "workflow") { usage(); return; }
  if (args[1] === "run") { await runNewJob(); return; }
  if (args[1] === "edit") { await editJob(); return; }
  if (args[1] === "approve") { await approveJob(); return; }
  usage();
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
