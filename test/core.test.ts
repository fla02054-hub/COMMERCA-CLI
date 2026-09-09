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
