import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RuntimeWorkflow } from "./flow.js";

export interface SavedJob { jobId: string; workflow: RuntimeWorkflow; }

function jobRoots(): string[] {
  const configured = process.env.COMMERCA_JOB_DIR;
  const roots = [configured ?? "./.commerca/jobs", "./.commerca/jobs"];
  return [...new Set(roots.filter(Boolean).map((root) => resolve(root)))];
}

function fileFor(root: string, jobId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(jobId)) throw new Error("Invalid job id.");
  return join(root, `${jobId}.json`);
}

export async function saveJob(jobId: string, workflow: RuntimeWorkflow): Promise<void> {
  const root = jobRoots()[0];
  if (!root) throw new Error("COMMERCA job directory is not configured.");
  const path = fileFor(root, jobId);
  await mkdir(root, { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify({ jobId, workflow }, null, 2), "utf8");
  await rename(temp, path);
}

export async function loadJob(jobId: string): Promise<SavedJob> {
  const paths = jobRoots().map((root) => fileFor(root, jobId));
  for (const path of paths) {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as SavedJob;
      if (!parsed || parsed.jobId !== jobId || !parsed.workflow?.state || !Array.isArray(parsed.workflow.artifacts)) continue;
      return parsed;
    } catch {
      // Try the next known local job root.
    }
  }
  throw new Error(`Job not found: ${jobId}`);
}
