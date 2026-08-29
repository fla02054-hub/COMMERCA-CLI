import type { MarketEvidence, MarketResearchProvider } from "./types.js";

export class MarketResearchRegistry {
  private readonly providers = new Map<string, MarketResearchProvider>();

  register(provider: MarketResearchProvider): void { this.providers.set(provider.name, provider); }
  list(): MarketResearchProvider[] { return [...this.providers.values()]; }

  async research(input: { productId?: string; productName: string; query: string }): Promise<MarketEvidence[]> {
    return Promise.all(this.list().map(async (provider) => provider.research(input)));
  }
}

export class FixtureMarketResearchProvider implements MarketResearchProvider {
  readonly name = "fixture";
  async research(input: { productId?: string; productName: string; query: string }): Promise<MarketEvidence> {
    return {
      productId: input.productId,
      demand: { score: 0, evidence: [] },
      trend: { direction: "unknown", evidence: [] },
      competitor: { count: 0, evidence: [] },
      ads: { count: 0, evidence: [] },
      source: this.name,
    };
  }
}
