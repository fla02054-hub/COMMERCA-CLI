import { BrowserController } from "../browser/controller.js";
import type { Product } from "../product/types.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

type AgentResult = Partial<Product> & { image?: string; coupon?: string; voucher?: string };

function jsonFrom(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return JSON.parse((fenced?.[1] ?? text).trim());
}

function validResult(value: unknown): AgentResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string" || v.name.trim().length < 3) return undefined;
  const numberFields = ["price", "originalPrice", "discount", "rating", "reviewCount", "salesCount"];
  for (const field of numberFields) if (v[field] !== undefined && typeof v[field] !== "number") return undefined;
  return v as AgentResult;
}

async function askAgent(snapshot: string, apiKey: string, model: string): Promise<{ action: string; value?: string; product?: AgentResult }> {
  const prompt = `You are an autonomous shopping-page browser agent. Inspect the supplied live Shopee page snapshot. Decide the smallest useful browser action. You may choose extract when product facts are visible, scroll when more content is needed, click when a visible text control is useful, wait when the page is loading, or stop when blocked. Never bypass CAPTCHA, login, paywalls, or access controls. Return ONLY JSON: {"action":"extract|scroll|click|wait|stop","value":"text if click","product":{...}}. For extract, product.name is required and use only facts visible in the snapshot. Fields: name, price, originalPrice, discount, seller, rating, reviewCount, salesCount, promotion, image.`;
  const response = await fetch(`${API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: `${prompt}\n\nPAGE SNAPSHOT:\n${snapshot.slice(0, 30000)}` }] }] }),
  });
  if (!response.ok) throw new Error(`Browser Agent Gemini request failed (${response.status}).`);
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Browser Agent received no decision.");
  const value = jsonFrom(text) as Record<string, unknown>;
  return { action: String(value.action ?? "stop"), value: typeof value.value === "string" ? value.value : undefined, product: validResult(value.product) };
}

async function snapshot(browser: BrowserController): Promise<string> {
  return browser.evaluate<string>(`(() => {
    const clean = (v) => String(v ?? '').replace(/\\s+/g, ' ').trim();
    const body = clean(document.body?.innerText || '');
    const controls = [...document.querySelectorAll('a,button,[role="button"]')].map((n) => clean(n.textContent || '')).filter(Boolean).slice(0, 150);
    return JSON.stringify({ url: location.href, title: document.title, body, controls });
  })()`);
}

async function clickText(browser: BrowserController, wanted: string): Promise<void> {
  const safe = JSON.stringify(wanted);
  await browser.evaluate(`(() => { const wanted=${safe}.toLowerCase(); const nodes=[...document.querySelectorAll('a,button,[role="button"]')]; const node=nodes.find(n=>String(n.textContent||'').replace(/\\s+/g,' ').trim().toLowerCase().includes(wanted)); if(node){ node.click(); return true; } return false; })()`);
}

export async function runShopeeBrowserAgent(url: string, options: { browserPort?: number; maxSteps?: number; apiKey?: string; model?: string } = {}): Promise<Product & Record<string, unknown>> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for the autonomous Shopee Browser Agent.");
  const browser = new BrowserController({ port: options.browserPort ?? 9222 });
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  try {
    await browser.open(url);
    let best: AgentResult | undefined;
    for (let step = 0; step < (options.maxSteps ?? 8); step++) {
      await browser.wait(1200);
      const decision = await askAgent(await snapshot(browser), apiKey, model);
      if (decision.product?.name) best = { ...(best ?? {}), ...decision.product };
      if (decision.action === "extract" && best?.name) break;
      if (decision.action === "scroll") { await browser.evaluate(`window.scrollBy(0, Math.max(500, Math.floor(innerHeight*0.8)))`); continue; }
      if (decision.action === "click" && decision.value) { await clickText(browser, decision.value); continue; }
      if (decision.action === "wait") { await browser.wait(2500); continue; }
      if (decision.action === "stop") break;
    }
    if (!best?.name) throw new Error("Shopee Browser Agent could not identify a product page from the visible page.");
    return { id: `shopee-agent-${Date.now()}`, name: best.name, url, price: best.price, originalPrice: best.originalPrice, discount: best.discount, seller: best.seller, rating: best.rating, reviewCount: best.reviewCount, salesCount: best.salesCount, promotion: best.promotion, source: "shopee-ai-browser-agent", discoveredAt: new Date().toISOString(), ...(best.image ? { image: best.image } : {}) };
  } finally { browser.close(); }
}
