import type { PerformanceReport } from "../runtime/stage-artifacts.js";

export type Decision = "scale" | "iterate" | "stop";

export interface DecisionReport {
  decision: Decision;
  rationale: string[];
  learning: string[];
  nextActions: string[];
}

export function buildDecisionReport(performance: PerformanceReport): DecisionReport {
  const ctr = performance.ctr;
  const conversion = performance.conversion;
  const profitable = performance.commission > 0 && performance.commission >= performance.cpc;

  if (profitable && ctr >= 0.02 && conversion >= 0.02) {
    return {
      decision: "scale",
      rationale: ["positive commission relative to CPC", "CTR and conversion meet scale thresholds"],
      learning: ["the tested creative generated meaningful engagement and conversion"],
      nextActions: ["increase distribution gradually", "retain the winning creative angle", "continue monitoring efficiency"],
    };
  }

  if (ctr > 0 || conversion > 0 || performance.commission > 0) {
    return {
      decision: "iterate",
      rationale: ["performance shows signal but does not meet scale thresholds"],
      learning: ["retain observed signals and test a revised hook, creative, or audience"],
      nextActions: ["create a controlled variant", "run another measurement cycle", "compare against the current baseline"],
    };
  }

  return {
    decision: "stop",
    rationale: ["no measurable performance signal"],
    learning: ["the current combination did not produce usable evidence"],
    nextActions: ["stop the current variant", "document the failure", "test a materially different approach"],
  };
}

export function validateDecisionReport(report: DecisionReport): string[] {
  const errors: string[] = [];
  if (!["scale", "iterate", "stop"].includes(report.decision)) errors.push("invalid decision");
  if (report.rationale.length === 0) errors.push("missing rationale");
  if (report.learning.length === 0) errors.push("missing learning");
  if (report.nextActions.length === 0) errors.push("missing next actions");
  return errors;
}
