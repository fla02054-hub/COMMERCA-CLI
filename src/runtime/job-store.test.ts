import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveJob, loadJob } from "./job-store.js";
import { createRuntimeWorkflow } from "./flow.js";

test("job store saves and reloads a workflow by id", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerca-job-store-"));
  const previous = process.env.COMMERCA_JOB_DIR;
  process.env.COMMERCA_JOB_DIR = root;
  try {
    const workflow = createRuntimeWorkflow("job persistence test");
    await saveJob("JOB-TEST-1", workflow);
    const loaded = await loadJob("JOB-TEST-1");
    assert.equal(loaded.jobId, "JOB-TEST-1");
    assert.equal(loaded.workflow.goal, "job persistence test");
  } finally {
    if (previous === undefined) delete process.env.COMMERCA_JOB_DIR;
    else process.env.COMMERCA_JOB_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("job store error identifies the job", async () => {
  const root = await mkdtemp(join(tmpdir(), "commerca-job-store-missing-"));
  const previous = process.env.COMMERCA_JOB_DIR;
  process.env.COMMERCA_JOB_DIR = root;
  try {
    await assert.rejects(() => loadJob("JOB-MISSING"), /Job not found: JOB-MISSING/);
  } finally {
    if (previous === undefined) delete process.env.COMMERCA_JOB_DIR;
    else process.env.COMMERCA_JOB_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
