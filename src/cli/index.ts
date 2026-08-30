import { runWorkflowWithProduct, createStageRegistry, executeWorkflow, type RuntimeWorkflow } from "../runtime/index.js";
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
function usage(): void { console.log("COMMERCA-CLI\n\n  workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]\n  workflow approve --job-id <JOB-ID> [--caption <caption>] [--sub-id <sub-id>]"); }

async function runNewJob(): Promise<void> {
  const name = valueAfter("--product"), special = price(valueAfter("--price"), "Special price"), original = price(valueAfter("--original-price"), "Original price"), url = valueAfter("--url"), image = valueAfter("--image"), extra = valuesAfter("--images");
  if (!name || special === undefined || original === undefined || !url || !image) throw new Error("usage: workflow run --product <name> --original-price <price> --price <special-price> --url <url> --image <image> [--images <image1> <image2> ...]");
  if (original < special) throw new Error("Original price cannot be lower than the special price.");
  const jobId = id("JOB"), subId = id("SUB"), images = [...new Set([image, ...extra].filter(Boolean))];
  const product: Product = { id: `manual-${crypto.randomUUID()}`, name, price: special, originalPrice: original, discount: original > 0 ? Math.round(((original - special) / original) * 100) : 0, promotion: original !== special ? `ลดเหลือ ฿${special.toLocaleString("th-TH")} จากราคาปกติ ฿${original.toLocaleString("th-TH")}` : undefined, url, image, images, subId, source: "manual", discoveredAt: new Date().toISOString() };
  console.log(`COMMERCA-CLI\nJOB ID: ${jobId}\nSUB ID: ${subId}\nPRODUCT: ${name}\n`);
  const workflow = await runWorkflowWithProduct(name, product, { stopAfterQc: true });
  const status: JobRecord["status"] = workflow.state.status === "awaiting_approval" ? "awaiting-approval" : workflow.state.status === "failed" ? "failed" : "published";
  await saveJob({ jobId, subId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status, workflow });
  if (workflow.state.status === "awaiting_approval") { console.log("QC PASSED — จุดตรวจ/แก้ไข/อนุมัติ"); console.log(`JOB ID: ${jobId}`); console.log(`SUB ID: ${subId}`); console.log(`อนุมัติ (แก้ได้ในคำสั่งเดียว): npm run dev -- workflow approve --job-id ${jobId} [--caption \"ข้อความใหม่\"] [--sub-id \"${subId}\"]`); return; }
  console.log(JSON.stringify({ jobId, subId, workflow }, null, 2));
  if (workflow.state.status === "failed") process.exit(1);
}

async function approveJob(): Promise<void> {
  const jobId = valueAfter("--job-id"); if (!jobId) throw new Error("--job-id is required.");
  const job = await loadJob(jobId); if (job.status !== "awaiting-approval") throw new Error(`Job ${jobId} is not waiting at the QC approval point.`);
  const product = latestArtifact<Product>(job.workflow, "product-input"), content = latestArtifact<any>(job.workflow, "content-package");
  if (!product || !content) throw new Error("Job content is incomplete.");
  const caption = valueAfter("--caption"), subId = valueAfter("--sub-id");
  if (caption !== undefined) { content.caption = caption; job.edits = { ...(job.edits ?? {}), caption }; }
  if (subId !== undefined) { product.subId = subId; job.subId = subId; job.edits = { ...(job.edits ?? {}), subId }; }
  job.workflow.state.status = "running"; job.workflow.state.currentStage = "publishing";
  const publishing = job.workflow.state.stages.find((s) => s.stage === "publishing"); if (!publishing) throw new Error("Publishing stage is missing.");
  publishing.status = "pending"; delete publishing.error;
  const workflow = await executeWorkflow(job.workflow, createStageRegistry({ product }));
  job.workflow = workflow; job.status = workflow.state.status === "completed" ? "published" : "failed"; job.updatedAt = new Date().toISOString(); await saveJob(job);
  console.log(JSON.stringify({ jobId, subId: product.subId, workflow }, null, 2));
  if (workflow.state.status === "failed") process.exit(1);
}

async function main(): Promise<void> { if (args[0] !== "workflow") return usage(); if (args[1] === "run") return runNewJob(); if (args[1] === "approve") return approveJob(); usage(); }
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
