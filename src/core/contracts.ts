import type {
  AnalysisData,
  ContentData,
  NodePayload,
  PostAnalysisData,
  PostData,
  ProductData,
  ProductInput,
  ProductionData
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, owner: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${owner}.${field} must be a non-empty string.`);
  return value;
}

function requiredStringArray(value: unknown, field: string, owner: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`${owner}.${field} must be an array of strings.`);
  }
  return value as string[];
}

function requiredFiniteNumber(value: unknown, field: string, owner: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${owner}.${field} must be a finite number.`);
  return value;
}

export function validateProductInput(input: unknown): asserts input is ProductInput {
  if (!isRecord(input)) throw new Error("PRODUCT input must be an object.");
  requiredString(input.name, "name", "PRODUCT input");
  if (input.price !== undefined) requiredFiniteNumber(input.price, "price", "PRODUCT input");
  if (input.originalPrice !== undefined) requiredFiniteNumber(input.originalPrice, "originalPrice", "PRODUCT input");
  if (input.url !== undefined && typeof input.url !== "string") throw new Error("PRODUCT input.url must be a string.");
  if (input.image !== undefined && typeof input.image !== "string") throw new Error("PRODUCT input.image must be a string.");
  if (input.source !== undefined && typeof input.source !== "string") throw new Error("PRODUCT input.source must be a string.");
}

export function validateProductData(value: unknown): asserts value is ProductData {
  if (!isRecord(value)) throw new Error("PRODUCT output product must be an object.");
  requiredString(value.id, "id", "PRODUCT.product");
  requiredString(value.name, "name", "PRODUCT.product");
  requiredFiniteNumber(value.discountPercent, "discountPercent", "PRODUCT.product");
  requiredString(value.receivedAt, "receivedAt", "PRODUCT.product");
}

export function validateAnalysisData(value: unknown): asserts value is AnalysisData {
  if (!isRecord(value)) throw new Error("ANALYSIS output analysis must be an object.");
  requiredString(value.category, "category", "ANALYSIS.analysis");
  requiredStringArray(value.audience, "audience", "ANALYSIS.analysis");
  requiredStringArray(value.problems, "problems", "ANALYSIS.analysis");
  requiredStringArray(value.benefits, "benefits", "ANALYSIS.analysis");
  requiredStringArray(value.sellingPoints, "sellingPoints", "ANALYSIS.analysis");
}

export function validateContentData(value: unknown): asserts value is ContentData {
  if (!isRecord(value)) throw new Error("CONTENT output content must be an object.");
  for (const field of ["hook", "angle", "story", "caption", "cta"] as const) requiredString(value[field], field, "CONTENT.content");
}

export function validateProductionData(value: unknown): asserts value is ProductionData {
  if (!isRecord(value)) throw new Error("PRODUCTION output production must be an object.");
  requiredString(value.imagePrompt, "imagePrompt", "PRODUCTION.production");
  requiredString(value.videoPrompt, "videoPrompt", "PRODUCTION.production");
  requiredStringArray(value.scenes, "scenes", "PRODUCTION.production");
}

export function validatePostData(value: unknown): asserts value is PostData {
  if (!isRecord(value)) throw new Error("POST output post must be an object.");
  requiredString(value.platform, "platform", "POST.post");
  if (value.status !== "ready" && value.status !== "posted" && value.status !== "failed") {
    throw new Error("POST.post.status must be ready, posted, or failed.");
  }
  for (const field of ["postId", "postUrl", "error", "idempotencyKey"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "string") throw new Error(`POST.post.${field} must be a string.`);
  }
}

export function validatePostAnalysisData(value: unknown): asserts value is PostAnalysisData {
  if (!isRecord(value)) throw new Error("POST ANALYSIS output analysis must be an object.");
  for (const field of ["views", "likes", "comments", "shares", "clicks", "orders", "ctr", "engagementRate", "score"] as const) {
    requiredFiniteNumber(value[field], field, "POST ANALYSIS.analysis");
  }
  requiredString(value.nextAction, "nextAction", "POST ANALYSIS.analysis");
}

export function validateNodeOutput(node: string, output: NodePayload): void {
  const value = output[node === "POST ANALYSIS" ? "analysis" : node === "PRODUCT" ? "product" : node.toLowerCase()] ??
    (node === "ANALYSIS" ? output.analysis : undefined);
  if (node === "PRODUCT") validateProductData(output.product);
  else if (node === "ANALYSIS") validateAnalysisData(output.analysis);
  else if (node === "CONTENT") validateContentData(output.content);
  else if (node === "PRODUCTION") validateProductionData(output.production);
  else if (node === "POST") validatePostData(output.post);
  else if (node === "POST ANALYSIS") validatePostAnalysisData(output.analysis);
  else if (value === undefined) throw new Error(`Unknown node contract: ${node}`);
}
