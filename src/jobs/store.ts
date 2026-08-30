import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeWorkflow } from "../runtime/flow.js";

export interface JobRecord {
  jobId: string;
  subId: string;
  createdAt: string;
  updatedAt: string;
  status: "awaiting-approval" | "published" | "failed";
  workflow: RuntimeWorkflow;
  edits?: {
    caption?: string;
    subId?: string;
  };
}

function jobsDir(): string {
  return process.env.COMMERCA_JOBS_DIR ?? "./output/jobs";
}

function jobPath(jobId: string): string {
  return join(jobsDir(), `${jobId}.json`);
}

export async function saveJob(job: JobRecord): Promise<void> {
  const path = jobPath(job.jobId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(job, null, 2), "utf8");
}

export async function loadJob(jobId: string): Promise<JobRecord> {
  const raw = await readFile(jobPath(jobId), "utf8");
  return JSON.parse(raw) as JobRecord;
}
