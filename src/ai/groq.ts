import type { Product } from "../product/types.js";
import type { ProductAnalysis } from "../product/analysis.js";
import { generateContent } from "../content/index.js";
import type { ContentPackage } from "../content/index.js";

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const API_BASE = "https://api.groq.com/openai/v1/chat/completions";
function extractJson(text: string): string { return text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim() ?? text.trim(); }
function validateContent(value: unknown, product: Product): ContentPackage {
  if (!value || typeof value !== "object") throw new Error("Groq returned a non-object content package.");
  const item = value as Record<string, unknown>;
  for (const field of ["title", "hook", "body", "callToAction"]) if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Groq content missing ${field}.`);
  if (!Array.isArray(item.hashtags) || item.hashtags.length < 3 || item.hashtags.some(tag => typeof tag !== "string" || !/^#[^\s#]+/.test(tag.trim()))) throw new Error("Groq content has invalid hashtags.");
  if (typeof item.caption === "string" && item.caption.includes(product.url ?? "__missing_url__")) throw new Error("Groq caption must not contain the product URL.");
  const base = generateContent({ product, score: 0, factors: { price: 0, commission: 0, demand: 0, socialProof: 0, promotion: 0, contentPotential: 0 }, reasons: [] });
  return { ...base, hook: item.hook as string, body: item.body as string, hashtags: (item.hashtags as string[]).slice(0, 5), productUrl: product.url ?? base.productUrl };
}
export async function generateContentWithGroq(analysis: ProductAnalysis, options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {}): Promise<ContentPackage> {
  const apiKey = options.apiKey?.trim() || process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is required for Groq content generation.");
  const model = options.model?.trim() || process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = ["Create a Thai-language ecommerce affiliate content package for the selected product.","Return ONLY valid JSON with fields: title, hook, body, callToAction, hashtags.","Use only facts explicitly present in product data. Never invent specs, reviews, sales, health claims, or discounts.","Do NOT include the product URL in generated text; the system places it in firstComment.","hashtags must be 3-5 short readable hashtags.",JSON.stringify({ product: analysis.product })].join("\n");
  const response = await fetchImpl(API_BASE, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2, max_tokens: 900 }) });
  if (!response.ok) throw new Error(`Groq API request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json() as any; const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq API returned no text candidate.");
  return validateContent(JSON.parse(extractJson(text)), analysis.product);
}
