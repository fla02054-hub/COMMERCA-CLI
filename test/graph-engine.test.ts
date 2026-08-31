import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowGraphEngine } from "../src/runtime/graph-engine.js";

test("graph engine passes data between nodes and follows declared edges", async () => {
  const engine = new WorkflowGraphEngine();
  engine.register({ id: "input", type: "trigger", next: ["double"], execute: async ({ data }) => ({ data: { value: Number(data.value ?? 0) } }) });
  engine.register({ id: "double", type: "code", next: ["done"], execute: async ({ data }) => ({ output: Number(data.value) * 2, data: { doubled: Number(data.value) * 2 } }) });
  engine.register({ id: "done", type: "output", execute: async ({ data }) => ({ output: { value: data.doubled } }) });
  const result = await engine.run({ value: 21 }, { startNode: "input" });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.history, ["input", "double", "done"]);
  assert.deepEqual(result.outputs.done, { value: 42 });
});

test("graph engine supports dynamic routing without changing node definitions", async () => {
  const engine = new WorkflowGraphEngine();
  engine.register({ id: "start", type: "trigger", next: ["yes", "no"], execute: async ({ data }) => ({ data: { route: data.route } }) });
  engine.register({ id: "yes", type: "action", execute: async () => ({ output: "yes" }) });
  engine.register({ id: "no", type: "action", execute: async () => ({ output: "no" }) });
  const result = await engine.run({ route: "yes" }, { startNode: "start", chooseNext: async context => [String(context.data.route)] });
  assert.deepEqual(result.history, ["start", "yes"]);
  assert.equal(result.outputs.yes, "yes");
});

test("graph engine retries failed nodes and can continue on failure", async () => {
  const engine = new WorkflowGraphEngine();
  let attempts = 0;
  engine.register({ id: "unstable", type: "action", next: ["done"], retry: { maxAttempts: 3 }, execute: async () => { attempts++; if (attempts < 3) throw new Error("temporary"); return { output: "ok" }; } });
  engine.register({ id: "done", type: "output", execute: async () => ({ output: "finished" }) });
  const result = await engine.run({}, { startNode: "unstable" });
  assert.equal(attempts, 3);
  assert.equal(result.outputs.done, "finished");

  const tolerant = new WorkflowGraphEngine();
  tolerant.register({ id: "bad", type: "action", continueOnFail: true, execute: async () => { throw new Error("ignored"); } });
  const continued = await tolerant.run({}, { startNode: "bad" });
  assert.equal(continued.status, "completed");
  assert.equal(continued.nodes.bad.status, "failed");
  assert.equal(continued.nodes.bad.error, "ignored");
});

test("disabled nodes are skipped", async () => {
  const engine = new WorkflowGraphEngine();
  engine.register({ id: "disabled", type: "action", disabled: true, next: ["done"], execute: async () => { throw new Error("must not execute"); } });
  engine.register({ id: "done", type: "output", execute: async () => ({ output: true }) });
  const result = await engine.run({}, { startNode: "disabled" });
  assert.equal(result.nodes.disabled.status, "skipped");
  assert.equal(result.outputs.done, undefined);
});
