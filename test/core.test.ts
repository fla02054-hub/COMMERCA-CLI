import test from "node:test";
import assert from "node:assert/strict";
import { FlowEngine } from "../src/core/flow.js";
import { DEFAULT_WORKFLOW } from "../src/core/workflow.js";
import { Aiden } from "../src/aiden/aiden.js";
import { ProductNode } from "../src/nodes/product.js";
import { AnalysisNode } from "../src/nodes/analysis.js";
import { ContentNode } from "../src/nodes/content.js";
import { ProductionNode } from "../src/nodes/production.js";
import { PostNode } from "../src/nodes/post.js";
import { PostAnalysisNode } from "../src/nodes/post-analysis.js";
import type { FlowNode, NodeContext, NodePayload } from "../src/core/types.js";

function nodes(): FlowNode[] {
  return [new ProductNode(), new AnalysisNode(), new ContentNode(), new ProductionNode(), new PostNode(), new PostAnalysisNode()];
}

test("default workflow is valid and linear", () => {
  const flow = new FlowEngine(nodes());
  flow.validate();
  assert.deepEqual(flow.plan(), DEFAULT_WORKFLOW.nodes);
  assert.equal(flow.getWorkflow().version, 1);
});

test("default connections are exactly the six-node pipeline", () => {
  const flow = new FlowEngine(nodes());
  assert.deepEqual(flow.getWorkflow().connections, [
    { from: "PRODUCT", output: "product", to: "ANALYSIS", input: "product" },
    { from: "ANALYSIS", output: "analysis", to: "CONTENT", input: "analysis" },
    { from: "CONTENT", output: "content", to: "PRODUCTION", input: "content" },
    { from: "PRODUCTION", output: "production", to: "POST", input: "production" },
    { from: "POST", output: "post", to: "POST ANALYSIS", input: "post" }
  ]);
});

test("workflow executes all six nodes", async () => {
  const flow = new FlowEngine(nodes());
  const aiden = new Aiden(flow);
  const job = await aiden.run({ name: "ทดสอบสินค้า", price: 100, originalPrice: 200 });
  assert.equal(job.status, "completed");
  assert.equal(job.currentNode, null);
  assert.deepEqual(Object.keys(job.nodeData), DEFAULT_WORKFLOW.nodes);
  assert.equal(job.product?.discountPercent, 50);
  assert.equal(job.post?.status, "ready");
  assert.ok(job.executionId);
});

test("node retry works without changing workflow", async () => {
  let attempts = 0;
  const flaky: FlowNode = {
    name: "ANALYSIS",
    inputPorts: [{ name: "product" }],
    outputPorts: [{ name: "analysis" }],
    async execute(context: NodeContext): Promise<NodePayload> {
      attempts++;
      if (attempts === 1) throw new Error("temporary failure");
      return new AnalysisNode().execute(context);
    }
  };
  const flow = new FlowEngine([new ProductNode(), flaky, new ContentNode(), new ProductionNode(), new PostNode(), new PostAnalysisNode()]);
  const aiden = new Aiden(flow);
  const job = await aiden.run({ name: "ทดสอบ retry" }, { maxAttempts: 2 });
  assert.equal(job.status, "completed");
  assert.equal(attempts, 2);
  assert.equal(job.nodeExecutions.ANALYSIS?.attempt, 2);
});

test("resume continues from the failed node", async () => {
  let failedOnce = true;
  const flaky: FlowNode = {
    name: "CONTENT",
    inputPorts: [{ name: "analysis" }],
    outputPorts: [{ name: "content" }],
    async execute(context: NodeContext): Promise<NodePayload> {
      if (failedOnce) {
        failedOnce = false;
        throw new Error("content provider unavailable");
      }
      return new ContentNode().execute(context);
    }
  };
  const flow = new FlowEngine([new ProductNode(), new AnalysisNode(), flaky, new ProductionNode(), new PostNode(), new PostAnalysisNode()]);
  const aiden = new Aiden(flow);
  const failed = await aiden.run({ name: "ทดสอบ resume" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.currentNode, "CONTENT");
  assert.equal(failed.nodeExecutions.PRODUCT?.status, "completed");
  assert.equal(failed.nodeExecutions.ANALYSIS?.status, "completed");

  const resumed = await aiden.resume(failed);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.currentNode, null);
  assert.equal(resumed.nodeExecutions.PRODUCT?.attempt, 1);
  assert.equal(resumed.nodeExecutions.ANALYSIS?.attempt, 1);
  assert.equal(resumed.nodeExecutions.CONTENT?.attempt, 2);
});

test("node timeout fails the current node", async () => {
  const slow: FlowNode = {
    name: "ANALYSIS",
    inputPorts: [{ name: "product" }],
    outputPorts: [{ name: "analysis" }],
    async execute(): Promise<NodePayload> {
      await new Promise(resolve => setTimeout(resolve, 50));
      return { analysis: {} };
    }
  };
  const flow = new FlowEngine([new ProductNode(), slow, new ContentNode(), new ProductionNode(), new PostNode(), new PostAnalysisNode()]);
  const aiden = new Aiden(flow);
  const job = await aiden.run({ name: "ทดสอบ timeout" }, { timeoutMs: 5 });
  assert.equal(job.status, "failed");
  assert.equal(job.currentNode, "ANALYSIS");
  assert.match(job.error ?? "", /timed out/);
});

test("dry run never executes nodes", async () => {
  let executions = 0;
  const dryNode = (name: "PRODUCT" | "ANALYSIS" | "CONTENT" | "PRODUCTION" | "POST" | "POST ANALYSIS", inputPorts: { name: string }[], outputPorts: { name: string }[]): FlowNode => ({
    name,
    inputPorts,
    outputPorts,
    async execute(): Promise<NodePayload> { executions++; return {}; }
  });
  const flow = new FlowEngine([
    dryNode("PRODUCT", [], [{ name: "product" }]),
    dryNode("ANALYSIS", [{ name: "product" }], [{ name: "analysis" }]),
    dryNode("CONTENT", [{ name: "analysis" }], [{ name: "content" }]),
    dryNode("PRODUCTION", [{ name: "content" }], [{ name: "production" }]),
    dryNode("POST", [{ name: "production" }], [{ name: "post" }]),
    dryNode("POST ANALYSIS", [{ name: "post" }], [{ name: "analysis" }])
  ]);
  const aiden = new Aiden(flow);
  const job = await aiden.run({ name: "dry run" }, { dryRun: true });
  assert.equal(job.status, "completed");
  assert.equal(executions, 0);
});
