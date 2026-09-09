import test from "node:test";
import assert from "node:assert/strict";
import { N8nLikeEngine, NodeRegistry, type WorkflowDefinition } from "../src/runtime/n8n-engine.js";

test("generic engine runs arbitrary nodes and passes outputs through context", async () => {
  const registry = new NodeRegistry();
  registry.register("input", async (ctx) => ctx.input);
  registry.register("transform", async (ctx) => ({ value: Number((ctx.outputs.input as { value: number }).value) * 2 }));
  const workflow: WorkflowDefinition = {
    id: "test-flow",
    version: 1,
    start: ["input"],
    nodes: {
      input: { id: "input", type: "input", next: ["double"] },
      double: { id: "double", type: "transform", next: [], execute: async (ctx) => ({ value: Number((ctx.outputs.input as { value: number }).value) * 2 }) },
    },
  };
  const result = await new N8nLikeEngine(registry).execute(workflow, { value: 21 });
  assert.equal(result.status, "success");
  assert.deepEqual(result.outputs.double, { value: 42 });
  assert.deepEqual(result.records.map((r) => r.nodeId), ["input", "double"]);
});

test("generic engine supports branches and retries", async () => {
  const registry = new NodeRegistry();
  let attempts = 0;
  registry.register("trigger", async () => "ok");
  registry.register("tool", async () => { attempts++; if (attempts < 2) throw new Error("temporary"); return "done"; });
  const workflow: WorkflowDefinition = {
    id: "branch-flow",
    version: 1,
    start: ["trigger"],
    nodes: {
      trigger: { id: "trigger", type: "trigger", next: ["left", "right"] },
      left: { id: "left", type: "tool", retry: 1, next: [] },
      right: { id: "right", type: "output", next: [] },
    },
  };
  const result = await new N8nLikeEngine(registry).execute(workflow, {});
  assert.equal(result.status, "success");
  assert.equal(attempts, 2);
  assert.deepEqual(result.records.map((r) => r.nodeId), ["trigger", "left", "right"]);
});

test("generic engine isolates failures when continueOnFail is enabled", async () => {
  const registry = new NodeRegistry();
  registry.register("tool", async () => { throw new Error("boom"); });
  const workflow: WorkflowDefinition = {
    id: "failure-flow",
    version: 1,
    start: ["tool"],
    nodes: { tool: { id: "tool", type: "tool", continueOnFail: true, next: ["out"] }, out: { id: "out", type: "output", next: [] } },
  };
  const result = await new N8nLikeEngine(registry).execute(workflow, {});
  assert.equal(result.status, "success");
  assert.deepEqual(result.outputs.tool, { error: "boom" });
  assert.equal(result.records.at(-1)?.nodeId, "out");
});
