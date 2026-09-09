import type { NodeName, WorkflowDefinition } from "./types.js";

export const DEFAULT_WORKFLOW: WorkflowDefinition = Object.freeze({
  name: "commerce-default",
  version: 1,
  nodes: ["PRODUCT", "ANALYSIS", "CONTENT", "PRODUCTION", "POST", "POST ANALYSIS"] as NodeName[],
  connections: [
    { from: "PRODUCT", output: "product", to: "ANALYSIS", input: "product" },
    { from: "ANALYSIS", output: "analysis", to: "CONTENT", input: "analysis" },
    { from: "CONTENT", output: "content", to: "PRODUCTION", input: "content" },
    { from: "PRODUCTION", output: "production", to: "POST", input: "production" },
    { from: "POST", output: "post", to: "POST ANALYSIS", input: "post" }
  ]
});

export function cloneWorkflow(definition: WorkflowDefinition): WorkflowDefinition {
  return {
    name: definition.name,
    version: definition.version,
    nodes: [...definition.nodes],
    connections: definition.connections.map(connection => ({ ...connection }))
  };
}
