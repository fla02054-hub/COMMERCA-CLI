export interface MarketEvidence {
  productId?: string;
  demand: { score: number; evidence: string[] };
  trend: { direction: "up" | "flat" | "down" | "unknown"; evidence: string[] };
  competitor: { count: number; evidence: string[] };
  ads: { count: number; evidence: string[] };
  source: string;
}

export interface MarketResearchProvider {
  name: string;
  research(input: { productId?: string; productName: string; query: string }): Promise<MarketEvidence>;
}
