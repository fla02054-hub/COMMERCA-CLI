import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeWorkflow } from "./flow.js";

const ROOT = process.env.COMMERCA_JOB_DIR ?? "./.commerca/jobs";
const fileFor = (jobId: string) => join(ROOT, `${jobId}.json`);

export async function saveJob(jobId: string, workflow: RuntimeWorkflow): Promise<void> {
  const path = fileFor(jobId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ jobId, workflow }, null, 2), "utf8");
}

export async function loadJob(jobId: string): Promise<{ jobId: string; workflow: RuntimeWorkflow }> {
  try {
    return JSON.parse(await readFile(fileFor(jobId), "utf8")) as { jobId: string; workflow: RuntimeWorkflow };
  } catch {
    throw new Error(`Job not found: ${jobId}`);
  }
}
