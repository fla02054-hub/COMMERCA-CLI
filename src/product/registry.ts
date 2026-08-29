import type { Product } from "./types.js";
import type { ProductProvider } from "./providers/index.js";

export interface ProviderSearchResult {
  provider: string;
  products: Product[];
  error?: string;
}

export class ProductProviderRegistry {
  private readonly providers = new Map<string, ProductProvider>();

  register(provider: ProductProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): ProductProvider | undefined {
    return this.providers.get(name);
  }

  list(): ProductProvider[] {
    return [...this.providers.values()];
  }

  async searchAll(query: string): Promise<ProviderSearchResult[]> {
    const results = await Promise.all(this.list().map(async (provider) => {
      try {
        return { provider: provider.name, products: await provider.search(query) } satisfies ProviderSearchResult;
      } catch (error) {
        return { provider: provider.name, products: [], error: error instanceof Error ? error.message : String(error) } satisfies ProviderSearchResult;
      }
    }));
    return results;
  }
}
