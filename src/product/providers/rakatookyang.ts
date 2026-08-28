import type { Product } from "../types.js";
import type { ProductProvider } from "./provider.js";

const BASE_URL = "https://rakatookyang.com";
const MAX_PRODUCTS = 50;

export class RakatookyangProvider implements ProductProvider {
  readonly name = "rakatookyang";

  async search(query: string): Promise<Product[]> {
    const candidates = buildSearchUrls(query);
    let lastError: unknown;

    for (const url of candidates) {
      try {
        const response = await fetch(url, {
          headers: {
            accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
          },
        });

        if (!response.ok) {
          lastError = new Error(`HTTP ${response.status} from ${url}`);
          continue;
        }

        const html = await response.text();
        const products = parseProducts(html, query);

        if (products.length > 0) {
          return products.slice(0, MAX_PRODUCTS);
        }

        lastError = new Error(`No products found at ${url}`);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `Rakatookyang search returned no products for "${query}". ${String(lastError ?? "Unknown error")}`,
    );
  }
}

function buildSearchUrls(query: string): string[] {
  const encoded = encodeURIComponent(query);
  const configured = process.env.RAKATOOKYANG_SEARCH_URL;

  if (configured) {
    return [configured.replace("{query}", encoded)];
  }

  return [
    `${BASE_URL}/search?q=${encoded}`,
    `${BASE_URL}/search?query=${encoded}`,
    `${BASE_URL}/?s=${encoded}`,
  ];
}

function parseProducts(html: string, query: string): Product[] {
  const products = new Map<string, Product>();

  for (const json of extractJsonLd(html)) {
    collectJsonLdProducts(json, products);
  }

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeHtml(match[1]);
    const text = cleanText(stripTags(match[2]));

    if (!looksLikeProductLink(href) || text.length < 3) continue;

    const url = new URL(href, BASE_URL).href;
    const price = parsePrice(text);
    const name = extractProductName(text, query);

    if (!name) continue;

    products.set(url, {
      id: `rakatookyang-${products.size + 1}`,
      name,
      ...(price !== undefined ? { price } : {}),
      url,
      source: "rakatookyang",
      discoveredAt: new Date().toISOString(),
    });
  }

  return [...products.values()];
}

function collectJsonLdProducts(value: unknown, products: Map<string, Product>): void {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdProducts(item, products);
    return;
  }

  const record = value as Record<string, unknown>;
  const type = String(record["@type"] ?? "").toLowerCase();

  if (type === "product") {
    const name = typeof record.name === "string" ? cleanText(record.name) : "";
    const url = typeof record.url === "string" ? new URL(record.url, BASE_URL).href : "";
    const offers = record.offers as Record<string, unknown> | undefined;
    const priceValue = offers && (offers.price ?? offers.lowPrice);
    const price = parsePrice(String(priceValue ?? ""));

    if (name && url) {
      products.set(url, {
        id: `rakatookyang-${products.size + 1}`,
        name,
        ...(price !== undefined ? { price } : {}),
        url,
        source: "rakatookyang",
        discoveredAt: new Date().toISOString(),
      });
    }
  }

  for (const value of Object.values(record)) {
    collectJsonLdProducts(value, products);
  }
}

function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = [];

  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      results.push(JSON.parse(match[1].trim()));
    } catch {
      // Ignore malformed JSON-LD blocks and continue with HTML parsing.
    }
  }

  return results;
}

function looksLikeProductLink(href: string): boolean {
  try {
    const url = new URL(href, BASE_URL);
    if (url.hostname !== new URL(BASE_URL).hostname) return false;
    return /\/(product|products|item|items|p)\//i.test(url.pathname);
  } catch {
    return false;
  }
}

function extractProductName(text: string, query: string): string | undefined {
  const lines = text
    .split(/\n+/)
    .map(cleanText)
    .filter((line) => line.length >= 3);

  const withoutPrice = lines.filter((line) => !/^฿?\s*[\d,.]+(?:\s*บาท)?$/i.test(line));
  const candidate = withoutPrice.find((line) =>
    query
      .toLowerCase()
      .split(/\s+/)
      .some((term) => term.length >= 2 && line.toLowerCase().includes(term)),
  );

  return candidate ?? withoutPrice[0];
}

function parsePrice(value: string): number | undefined {
  const match = value.match(/(?:฿|THB|บาท)\s*([\d,]+(?:\.\d{1,2})?)/i) ?? value.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)/i);
  if (!match) return undefined;

  const number = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(number) ? number : undefined;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
}

function cleanText(value: string): string {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/gi, "/")
    .replace(/&#47;/g, "/");
}
