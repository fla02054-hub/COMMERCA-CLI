import type { WorkflowArtifact, WorkflowStage } from "./workflow-schema.js";
import type { StageContext, StageResult, WorkflowStageHandler } from "./stage-contract.js";

export type StageExecutor = (context: StageContext) => Promise<StageResult>;

export class WorkflowStageRegistry {
  private readonly handlers = new Map<WorkflowStage, WorkflowStageHandler>();

  register(handler: WorkflowStageHandler): this {
    if (this.handlers.has(handler.stage)) throw new Error(`Stage already registered: ${handler.stage}`);
    this.handlers.set(handler.stage, handler);
    return this;
  }

  get(stage: WorkflowStage): WorkflowStageHandler {
    const handler = this.handlers.get(stage);
    if (!handler) throw new Error(`No handler registered for stage: ${stage}`);
    return handler;
  }

  has(stage: WorkflowStage): boolean { return this.handlers.has(stage); }
}

export function artifact<T>(stage: WorkflowStage, type: string, data: T): WorkflowArtifact<T> {
  return { stage, type, data, createdAt: new Date().toISOString() };
}

export class FunctionStage implements WorkflowStageHandler {
  constructor(public readonly stage: WorkflowStage, private readonly executor: StageExecutor) {}
  execute(context: StageContext): Promise<StageResult> { return this.executor(context); }
}
