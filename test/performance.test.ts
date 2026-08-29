import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPerformanceReport, validatePerformanceReport } from "../src/performance/index.ts";

test("Stage 13 builds a performance report", () => {
  const report = buildPerformanceReport({
    reach: 10000,
    clicks: 500,
    spend: 1000,
    conversions: 25,
    commission: 1500,
  });
  assert.equal(report.ctr, 0.05);
  assert.equal(report.cpc, 2);
  assert.equal(report.conversion, 0.05);
  assert.equal(validatePerformanceReport(report).length, 0);
});

test("Stage 13 handles zero denominators", () => {
  const report = buildPerformanceReport({ reach: 0, clicks: 0, spend: 0, conversions: 0, commission: 0 });
  assert.deepEqual(report, { reach: 0, ctr: 0, cpc: 0, conversion: 0, commission: 0 });
});

test("Stage 13 rejects impossible metrics", () => {
  assert.throws(() => buildPerformanceReport({ reach: 10, clicks: 11, spend: 1, conversions: 0, commission: 0 }));
  assert.throws(() => buildPerformanceReport({ reach: 10, clicks: 2, spend: 1, conversions: 3, commission: 0 }));
});
