import type { ProductionPackage, PublicationRecord } from "../runtime/stage-artifacts.js";

export interface PublishTarget {
  id: string;
  platform: "organic" | "ads";
  destination: string;
}

export interface PublicationPlan {
  targets: PublishTarget[];
  caption: string;
  productUrl: string;
  mediaPath: string;
  ready: boolean;
}

function mediaPath(production: ProductionPackage): string | undefined {
  const editing = production.editing as Record<string, unknown> | undefined;
  if (editing && typeof editing.finalMp4 === "string") return editing.finalMp4;
  const video = production.video;
  if (typeof video === "string") return video;
  if (video && typeof video === "object" && "path" in video && typeof (video as { path?: unknown }).path === "string") return (video as { path: string }).path;
  return undefined;
}

function validUrl(url: string): boolean {
  try { const parsed = new URL(url); return /^https?:$/.test(parsed.protocol) && !!parsed.hostname; } catch { return false; }
}

export function buildPublicationPlan(
  production: ProductionPackage,
  options: { caption?: string; productUrl?: string; targets?: PublishTarget[] } = {},
): PublicationPlan {
  const media = mediaPath(production);
  if (!media) throw new Error("publish-ready package requires a real final video path");
  if (!options.caption?.trim()) throw new Error("publish-ready package requires a non-empty sales caption");
  if (!options.productUrl?.trim() || !validUrl(options.productUrl)) throw new Error("publish-ready package requires a valid Product URL");
  const targets = options.targets ?? [{ id: "facebook-organic", platform: "organic", destination: "facebook" }];
  const errors = validatePublicationPlan({ targets, caption: options.caption.trim(), productUrl: options.productUrl.trim(), mediaPath: media, ready: false });
  if (errors.length) throw new Error(errors.join("; "));
  return { targets, caption: options.caption.trim(), productUrl: options.productUrl.trim(), mediaPath: media, ready: true };
}

export function createPublicationRecord(plan: PublicationPlan): PublicationRecord {
  const organic = plan.targets.filter((target) => target.platform === "organic");
  const ads = plan.targets.filter((target) => target.platform === "ads");
  return {
    ...(organic.length ? { organic: { status: "ready", destination: organic[0].destination, caption: plan.caption, productUrl: plan.productUrl, mediaPath: plan.mediaPath, targets: organic } } : {}),
    ...(ads.length ? { ads: { status: "ready", destination: ads[0].destination, caption: plan.caption, productUrl: plan.productUrl, mediaPath: plan.mediaPath, targets: ads } } : {}),
  };
}

export function validatePublicationPlan(plan: PublicationPlan): string[] {
  const errors: string[] = [];
  if (plan.targets.length === 0) errors.push("publishing requires at least one target");
  if (!plan.caption?.trim()) errors.push("publishing requires caption");
  if (!plan.productUrl?.trim() || !validUrl(plan.productUrl)) errors.push("publishing requires valid Product URL");
  if (!plan.mediaPath?.trim()) errors.push("publishing requires final media path");
  for (const target of plan.targets) {
    if (!target.id.trim()) errors.push("publication target id is required");
    if (!target.destination.trim()) errors.push("publication destination is required");
  }
  return errors;
}
