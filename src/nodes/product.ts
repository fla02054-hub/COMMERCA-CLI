import type { FlowNode, NodeContext } from "../core/types.js";
import { randomUUID } from "node:crypto";

export class ProductNode implements FlowNode {
  readonly name = "PRODUCT" as const;
  async execute({ job }: NodeContext): Promise<void> {
    const input = job.input;
    if (!input.name?.trim()) throw new Error("Product name is required.");
    if (input.price !== undefined && input.price < 0) throw new Error("Price cannot be negative.");
    if (input.originalPrice !== undefined && input.originalPrice < 0) throw new Error("Original price cannot be negative.");
    const discountPercent = input.originalPrice && input.price !== undefined && input.originalPrice > 0
      ? Math.round((1 - input.price / input.originalPrice) * 10000) / 100
      : 0;
    job.product = { ...input, id: randomUUID(), discountPercent, receivedAt: new Date().toISOString() };
  }
}
