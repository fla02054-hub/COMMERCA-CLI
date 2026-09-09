import type { FlowEngine, RunOptions } from "../core/flow.js";
import { clearJobCancellation, requestJobCancellation, saveJob } from "../core/store.js";
import type { JobState, ProductInput } from "../core/types.js";
import { randomUUID } from "node:crypto";

export class Aiden {
  readonly name = "AIDEN";
  readonly role = "ADMIN" as const;

  constructor(private readonly flow: FlowEngine) {}

  createJob(input: ProductInput): JobState {
    if (!input.name?.trim()) throw new Error("AIDEN requires a product name.");
    const now = new Date().toISOString();
    const workflow = this.flow.getWorkflow();
    const job: JobState = {
      id: randomUUID(),
      executionId: randomUUID(),
      workflowName: workflow.name,
      workflowVersion: workflow.version,
      status: "queued",
      currentNode: null,
      input,
      nodeData: {},
      nodeExecutions: {},
      history: [],
      createdAt: now,
      updatedAt: now
    };
    clearJobCancellation(job.id);
    saveJob(job);
    return job;
  }

  async run(input: ProductInput, options: RunOptions = {}): Promise<JobState> {
    const job = this.createJob(input);
    return this.flow.run(job, "PRODUCT", job.input, options);
  }

  async resume(job: JobState, options: RunOptions = {}): Promise<JobState> {
    clearJobCancellation(job.id);
    return this.flow.resume(job, options);
  }

  cancel(job: JobState): JobState {
    requestJobCancellation(job.id);
    return this.flow.cancel(job, "Cancellation requested by AIDEN.");
  }
}
