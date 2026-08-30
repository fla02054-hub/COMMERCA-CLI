import type { Product } from "../product/types.js";
import type { MarketEvidence, MarketResearchProvider } from "./types.js";

export class MarketResearchRegistry {
  private readonly providers = new Map<string, MarketResearchProvider>();

  register(provider: MarketResearchProvider): void { this.providers.set(provider.name, provider); }
  list(): MarketResearchProvider[] { return [...this.providers.values()]; }

  async research(input: { productId?: string; productName: string; query: string; product?: Product }): Promise<MarketEvidence[]> {
    return Promise.all(this.list().map(async (provider) => provider.research(input)));
  }
}

/**
 * Uses only facts already supplied for the product. It deliberately does not
 * manufacture demand, trend, competitor, or ad evidence.
 */
export class ProductDataMarketResearchProvider implements MarketResearchProvider {
  readonly name = "product-data";

  async research(input: { productId?: string; productName: string; query: string; product?: Product }): Promise<MarketEvidence> {
    const product = input.product;
    const demandEvidence: string[] = [];
    const socialProofEvidence: string[] = [];
    const promotionEvidence: string[] = [];

    if (product?.salesCount !== undefined) demandEvidence.push(`salesCount=${product.salesCount}`);
    if (product?.rating !== undefined) socialProofEvidence.push(`rating=${product.rating}`);
    if (product?.reviewCount !== undefined) socialProofEvidence.push(`reviewCount=${product.reviewCount}`);
    if (product?.discount !== undefined) promotionEvidence.push(`discount=${product.discount}%`);
    if (product?.originalPrice !== undefined && product.price !== undefined) {
      promotionEvidence.push(`originalPrice=${product.originalPrice}, price=${product.price}`);
    }

    return {
      productId: input.productId,
      demand: { score: demandScore(product), evidence: demandEvidence },
      trend: { direction: "unknown", evidence: [] },
      competitor: { count: 0, evidence: [] },
      ads: { count: 0, evidence: [] },
      source: this.name,
    };
  }
}

function demandScore(product?: Product): number {
  if (product?.salesCount === undefined) return 0;
  if (product.salesCount >= 10000) return 20;
  if (product.salesCount >= 5000) return 15;
  if (product.salesCount >= 1000) return 10;
  return 5;
}
