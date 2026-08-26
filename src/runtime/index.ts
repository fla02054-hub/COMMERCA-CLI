export type WorkflowStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed";

export interface WorkflowContext {
  goal: string;
  status: WorkflowStatus;
  product?: unknown;
  content?: unknown;
  qc?: unknown;
}

export function createWorkflow(goal: string): WorkflowContext {
  return {
    goal,
    status: "idle",
  };
}

export async function runWorkflow(
  context: WorkflowContext,
): Promise<WorkflowContext> {
  console.log("");
  console.log("=== COMMERCA WORKFLOW ===");
  console.log(`Goal: ${context.goal}`);
  console.log("");

  context.status = "running";

  console.log("[1/5] Product Discovery");
  console.log("[2/5] Product Analysis");
  console.log("[3/5] Product Selection");
  console.log("[4/5] Content Generation");
  console.log("[5/5] Content QC");

  context.status = "completed";

  console.log("");
  console.log("Workflow completed.");
  console.log("");

  return context;
}
