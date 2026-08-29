import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDecisionReport, validateDecisionReport } from "../src/decision/index.ts";

test("Stage 14 scales strong performance", () => {
  const report = buildDecisionReport({ reach: 10000, ctr: 0.05, cpc: 0.5, conversion: 0.05, commission: 100 });
  assert.equal(report.decision, "scale");
  assert.equal(validateDecisionReport(report).length, 0);
});

test("Stage 14 iterates when there is a signal but no scale case", () => {
  const report = buildDecisionReport({ reach: 10000, ctr: 0.01, cpc: 1, conversion: 0.01, commission: 10 });
  assert.equal(report.decision, "iterate");
  assert.equal(validateDecisionReport(report).length, 0);
});

test("Stage 14 stops when there is no signal", () => {
  const report = buildDecisionReport({ reach: 10000, ctr: 0, cpc: 0, conversion: 0, commission: 0 });
  assert.equal(report.decision, "stop");
  assert.equal(validateDecisionReport(report).length, 0);
});
