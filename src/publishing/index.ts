import type { ProductionPackage, PublicationRecord } from "../runtime/stage-artifacts.js";

export interface PublishTarget {
  id: string;
  platform: "organic" | "ads";
  destination: string;
}

export interface PublicationPlan {
  targets: PublishTarget[];
  caption?: string;
  productUrl?: string;
}

export function buildPublicationPlan(
  production: ProductionPackage,
  options: { caption?: string; productUrl?: string; targets?: PublishTarget[] } = {},
): PublicationPlan {
  if (!production.video && !production.image) {
    throw new Error("publishing requires a production image or video");
  }
  const targets = options.targets ?? [
    { id: "organic-default", platform: "organic", destination: "social" },
  ];
  if (targets.length === 0) throw new Error("publishing requires at least one target");
  return {
    targets,
    ...(options.caption ? { caption: options.caption } : {}),
    ...(options.productUrl ? { productUrl: options.productUrl } : {}),
  };
}

export function createPublicationRecord(plan: PublicationPlan): PublicationRecord {
  const organic = plan.targets.filter((target) => target.platform === "organic");
  const ads = plan.targets.filter((target) => target.platform === "ads");
  return {
    ...(organic.length ? { organic: { status: "planned", targets: organic } } : {}),
    ...(ads.length ? { ads: { status: "planned", targets: ads } } : {}),
  };
}

export function validatePublicationPlan(plan: PublicationPlan): string[] {
  const errors: string[] = [];
  if (plan.targets.length === 0) errors.push("publishing requires at least one target");
  for (const target of plan.targets) {
    if (!target.id.trim()) errors.push("publication target id is required");
    if (!target.destination.trim()) errors.push("publication destination is required");
  }
  return errors;
}
