import type { FlowNode, NodeContext, NodePayload } from "../core/types.js";
import { randomUUID } from "node:crypto";

export class ProductNode implements FlowNode {
  readonly name = "PRODUCT" as const;
  readonly inputPorts = [{ name: "product" }] as const;
  readonly outputPorts = [{ name: "product" }] as const;

  async execute({ job, input }: NodeContext): Promise<NodePayload> {
    const source = (input.product && typeof input.product === "object" ? input.product : job.input) as Record<string, unknown>;
    const name = typeof source.name === "string" ? source.name : "";
    const price = typeof source.price === "number" ? source.price : undefined;
    const originalPrice = typeof source.originalPrice === "number" ? source.originalPrice : undefined;
    if (!name.trim()) throw new Error("Product name is required.");
    if (price !== undefined && price < 0) throw new Error("Price cannot be negative.");
    if (originalPrice !== undefined && originalPrice < 0) throw new Error("Original price cannot be negative.");
    const discountPercent = originalPrice !== undefined && price !== undefined && originalPrice > 0
      ? Math.round((1 - price / originalPrice) * 10000) / 100
      : 0;
    const product = { ...source, id: randomUUID(), discountPercent, receivedAt: new Date().toISOString() };
    job.product = product as typeof job.product;
    return { product };
  }
}
