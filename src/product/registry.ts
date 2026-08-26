import type { ProductProvider } from "./providers/index.js";

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
}
