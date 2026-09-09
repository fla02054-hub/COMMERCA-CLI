import type { JobState } from "./types.js";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), ".commerca", "jobs");

export function saveJob(job: JobState): void {
  fs.mkdirSync(dir, { recursive: true });
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, `${job.id}.json`), JSON.stringify(job, null, 2), "utf8");
}

export function loadJob(id: string): JobState {
  const file = path.join(dir, `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`Job not found: ${id}`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as JobState;
}

export function listJobs(): JobState[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(x => x.endsWith(".json")).map(x => JSON.parse(fs.readFileSync(path.join(dir, x), "utf8")) as JobState).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
