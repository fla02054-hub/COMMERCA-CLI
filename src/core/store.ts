import type { JobState } from "./types.js";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), ".commerca", "jobs");
const cancelDir = path.resolve(process.cwd(), ".commerca", "cancel");

function fileFor(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid job id.");
  return path.join(dir, `${id}.json`);
}

function cancelFileFor(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("Invalid job id.");
  return path.join(cancelDir, `${id}.cancel`);
}

export function saveJob(job: JobState): void {
  fs.mkdirSync(dir, { recursive: true });
  job.updatedAt = new Date().toISOString();
  const file = fileFor(job.id);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function loadJob(id: string): JobState {
  const file = fileFor(id);
  if (!fs.existsSync(file)) throw new Error(`Job not found: ${id}`);
  const job = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<JobState>;
  if (!job.id || !job.input || !job.status) throw new Error(`Invalid job state: ${id}`);
  return normalizeJob(job as JobState);
}

export function listJobs(): JobState[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .map(name => normalizeJob(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as JobState))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function requestJobCancellation(id: string): void {
  loadJob(id);
  fs.mkdirSync(cancelDir, { recursive: true });
  fs.writeFileSync(cancelFileFor(id), new Date().toISOString(), "utf8");
}

export function isJobCancellationRequested(id: string): boolean {
  return fs.existsSync(cancelFileFor(id));
}

export function clearJobCancellation(id: string): void {
  const file = cancelFileFor(id);
  if (fs.existsSync(file)) fs.rmSync(file);
}

export function normalizeJob(job: JobState): JobState {
  const now = new Date().toISOString();
  job.executionId ??= job.id;
  job.workflowName ??= "commerce-default";
  job.workflowVersion ??= 1;
  job.currentNode ??= null;
  job.nodeData ??= {};
  job.nodeExecutions ??= {};
  job.history ??= [];
  job.createdAt ??= now;
  job.updatedAt ??= now;
  return job;
}
