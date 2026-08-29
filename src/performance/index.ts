import type { PerformanceReport } from "../runtime/stage-artifacts.js";

export interface PerformanceInput {
  reach: number;
  clicks: number;
  spend: number;
  conversions: number;
  commission: number;
}

export function buildPerformanceReport(input: PerformanceInput): PerformanceReport {
  if (input.reach < 0 || input.clicks < 0 || input.spend < 0 || input.conversions < 0 || input.commission < 0) {
    throw new Error("performance metrics cannot be negative");
  }
  if (input.clicks > input.reach) throw new Error("clicks cannot exceed reach");
  if (input.conversions > input.clicks) throw new Error("conversions cannot exceed clicks");

  const ctr = input.reach === 0 ? 0 : input.clicks / input.reach;
  const cpc = input.clicks === 0 ? 0 : input.spend / input.clicks;
  const conversion = input.clicks === 0 ? 0 : input.conversions / input.clicks;

  return {
    reach: input.reach,
    ctr,
    cpc,
    conversion,
    commission: input.commission,
  };
}

export function validatePerformanceReport(report: PerformanceReport): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(report.reach) || report.reach < 0) errors.push("invalid reach");
  if (!Number.isFinite(report.ctr) || report.ctr < 0 || report.ctr > 1) errors.push("invalid ctr");
  if (!Number.isFinite(report.cpc) || report.cpc < 0) errors.push("invalid cpc");
  if (!Number.isFinite(report.conversion) || report.conversion < 0 || report.conversion > 1) errors.push("invalid conversion");
  if (!Number.isFinite(report.commission) || report.commission < 0) errors.push("invalid commission");
  return errors;
}
