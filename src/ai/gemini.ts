import type { Product } from "../product/types.js";
import type { ProductAnalysis } from "../product/analysis.js";
import type { ContentPackage } from "../content/index.js";

const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced?.[1]?.trim() ?? text.trim();
}

function validateContent(value: unknown, product: Product): ContentPackage {
  if (!value || typeof value !== "object") throw new Error("Gemini returned a non-object content package.");
  const item = value as Record<string, unknown>;
  for (const field of ["title", "hook", "body", "callToAction"]) {
    if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`Gemini content missing ${field}.`);
  }
  if (!Array.isArray(item.hashtags) || item.hashtags.length === 0 || item.hashtags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    throw new Error("Gemini content missing hashtags.");
  }
  return {
    title: item.title as string,
    hook: item.hook as string,
    body: item.body as string,
    callToAction: item.callToAction as string,
    hashtags: item.hashtags as string[],
    ...(product.url ? { productUrl: product.url } : {}),
  };
}

export async function generateContentWithGemini(
  analysis: ProductAnalysis,
  options: { apiKey?: string; model?: string; fetchImpl?: typeof fetch } = {},
): Promise<ContentPackage> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for Gemini content generation.");
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const prompt = [
    "Create a Thai-language ecommerce affiliate content package for the selected product.",
    "Return ONLY valid JSON with exactly these fields: title, hook, body, callToAction, hashtags.",
    "title, hook, body and callToAction must be strings. hashtags must be an array of 4-8 strings.",
    "Do not invent product facts. Use only the supplied product and analysis.",
    JSON.stringify({ product: analysis.product, reasons: analysis.reasons, score: analysis.score }),
  ].join("\n");

  const response = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini API returned no text candidate.");
  return validateContent(JSON.parse(extractJson(text)), analysis.product);
}
