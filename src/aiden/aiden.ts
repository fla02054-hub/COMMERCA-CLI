import type { FlowEngine } from "../core/flow.js";
import { saveJob } from "../core/store.js";
import type { JobState, ProductInput } from "../core/types.js";
import { randomUUID } from "node:crypto";

export class Aiden {
  readonly name = "AIDEN";
  constructor(private readonly flow: FlowEngine) {}

  createJob(input: ProductInput): JobState {
    if (!input.name?.trim()) throw new Error("AIDEN requires a product name.");
    const now = new Date().toISOString();
    const job: JobState = {
      id: randomUUID(),
      status: "queued",
      currentNode: null,
      input,
      nodeExecutions: {},
      history: [],
      createdAt: now,
      updatedAt: now
    };
    saveJob(job);
    return job;
  }

  async run(input: ProductInput): Promise<JobState> {
    const job = this.createJob(input);
    return this.flow.run(job);
  }

  async resume(job: JobState): Promise<JobState> {
    return this.flow.resume(job);
  }
}
