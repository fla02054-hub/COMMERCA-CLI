import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium, type BrowserContext, type Page } from "playwright";
import { listAccounts, loginAccount, accountService } from "../accounts/account-manager.js";
import type { Product } from "./types.js";

const MODEL = process.env.GEMINI_PRODUCT_MODEL || "gemini-3.1-flash-lite-preview";
const GEMINI_KEY = process.env.GEMINI_API_KEY;

export interface ImageProductDiscovery {
  inputImage: string;
  queries: string[];
  candidates: Product[];
  selected: Product[];
}

async function geminiJson<T>(prompt: string, image?: { mimeType: string; bytes: Buffer }): Promise<T> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is missing in .env");
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.bytes.toString("base64") } });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${await response.text()}`);
  const body = await response.json() as any;
  const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("")?.trim();
  if (!text) throw new Error("Gemini returned no JSON");
  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/i, "")) as T;
}

function mimeFor(file: string): string {
  const ext = file.toLowerCase().split(".").pop();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
}

function chromePath(): string {
  const candidates = [
    process.env.COMMERCA_CHROME_PATH,
    process.env.PROGRAMFILES && `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env["PROGRAMFILES(X86)"] && `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter((x): x is string => Boolean(x));
  const found = candidates.find(existsSync);
  if (!found) throw new Error("Google Chrome not found. Install Chrome or set COMMERCA_CHROME_PATH.");
  return found;
}

async function ensureShopeeConnected(): Promise<void> {
  const account = listAccounts().find((x) => x.service === "shopee");
  if (account?.status === "CONNECTED") return;
  console.log("[PRODUCT] Shopee is not connected. Use Account Center to connect Shopee first.");
  await loginAccount(accountService("shopee"));
}

async function openShopeeContext(): Promise<BrowserContext> {
  await ensureShopeeConnected();
  const account = listAccounts().find((x) => x.service === "shopee");
  if (!account?.profileDir) throw new Error("Shopee account profile is unavailable.");
  return chromium.launchPersistentContext(account.profileDir, {
    headless: true,
    executablePath: chromePath(),
    viewport: { width: 1440, height: 1000 },
  });
}

async function searchShopee(page: Page, query: string): Promise<Product[]> {
  const url = `https://shopee.co.th/search?keyword=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(5000);
  const blocked = await page.locator("body").innerText().catch(() => "");
  if (/verify|captcha|robot|unusual traffic|ตรวจสอบ/i.test(blocked) && !/ขายแล้ว|฿|บาท/i.test(blocked)) {
    throw new Error("Shopee verification is active. Reconnect Shopee in Account Center, then run the same command again.");
  }

  const rows = await page.evaluate(`(() => {
    const clean = (v) => String(v ?? "").replace(/\\s+/g, " ").trim();
    const out = [];
    const seen = new Set();
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    for (const a of anchors) {
      const href = a.href;
      if (!/shopee\\.co\\.th\\//i.test(href)) continue;
      if (!/(?:product|i\\.|\\.\\d+\\.\\d+)/i.test(href)) continue;
      const text = clean(a.innerText || a.textContent);
      if (text.length < 4) continue;
      const key = href.split("?")[0];
      if (seen.has(key)) continue;
      seen.add(key);
      const img = a.querySelector("img");
      out.push({ name: text.slice(0, 300), url: key, image: img ? img.src : undefined });
      if (out.length >= 30) break;
    }
    return out;
  })()`);

  return (rows as { name: string; url: string; image?: string }[]).map((r, i) => ({
    id: `candidate-${Date.now()}-${i}`,
    name: r.name,
    url: r.url,
    image: r.image,
    source: "shopee-search",
    discoveredAt: new Date().toISOString(),
  }));
}

export async function discoverProductFromImage(imagePath: string): Promise<ImageProductDiscovery> {
  const bytes = await readFile(imagePath);
  const mimeType = mimeFor(imagePath);
  const vision = await geminiJson<{ productName: string; aliases: string[]; queries: string[] }>(
    `Analyze the supplied product image for Shopee Thailand product discovery. Identify only what is visibly/evidently supported by the image. Return JSON with productName, aliases, and 3-5 precise Thai search queries. Do not invent brand, model, specifications, price, discount, reviews, or claims. Queries should maximize exact product matching, not marketing wording.`,
    { mimeType, bytes },
  );
  const queries = [...new Set([vision.productName, ...(vision.aliases || []), ...(vision.queries || [])]
    .map((x) => String(x || "").trim()).filter(Boolean))].slice(0, 5);
  if (!queries.length) throw new Error("Gemini could not identify a usable Shopee search query from the image.");

  const context = await openShopeeContext();
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const all: Product[] = [];
    for (const query of queries) {
      console.log(`[PRODUCT] Shopee search: ${query}`);
      const found = await searchShopee(page, query);
      for (const item of found) if (!all.some((x) => x.url === item.url)) all.push(item);
    }
    if (!all.length) throw new Error("Shopee search returned no product candidates. Try a clearer product screenshot.");

    const shortlist = await geminiJson<{ indexes: number[]; reason: string }>(
      `You are matching a product screenshot to Shopee search candidates. Choose up to 8 candidates that most likely represent the exact same product shown in the image. Use ONLY candidate names/URLs below and the supplied image. Do not use price as a matching criterion. Return JSON {"indexes":[...],"reason":"..."}. Candidate indexes are zero-based.\n\nCANDIDATES:\n${all.slice(0, 60).map((x, i) => `[${i}] ${x.name} | ${x.url}`).join("\n")}`,
      { mimeType, bytes },
    );
    const chosen = (shortlist.indexes || [])
      .filter((i) => Number.isInteger(i) && i >= 0 && i < all.length)
      .slice(0, 8)
      .map((i) => all[i]);
    const selected: Product[] = [];
    for (const candidate of chosen) {
      try {
        const detail = await readDetailInPage(page, candidate.url);
        if (detail) selected.push({ ...candidate, ...detail, source: "shopee-browser" });
      } catch (error) {
        console.log(`[PRODUCT] Candidate skipped: ${candidate.url} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    selected.sort((a, b) => ((b.salesCount ?? 0) - (a.salesCount ?? 0)) || ((b.rating ?? 0) - (a.rating ?? 0)));
    return { inputImage: imagePath, queries, candidates: all, selected };
  } finally {
    await context.close();
  }
}

async function readDetailInPage(page: Page, url: string): Promise<Partial<Product> | undefined> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(3500);

  const result = await page.evaluate(`(() => {
    const clean = (v) => String(v ?? "").replace(/\\s+/g, " ").trim();
    const parse = (v) => {
      const m = String(v ?? "").replace(/,/g, "").match(/([0-9]+(?:\\.[0-9]+)?)([KkMm])?/);
      if (!m) return undefined;
      let n = Number(m[1]);
      if (m[2]?.toLowerCase() === "k") n *= 1000;
      if (m[2]?.toLowerCase() === "m") n *= 1000000;
      return n;
    };
    const body = clean(document.body?.innerText);
    if (/verify|captcha|robot|unusual traffic/i.test(body) && !/ขายแล้ว|฿|บาท/i.test(body)) {
      throw new Error("Shopee verification is active.");
    }
    const lines = (document.body?.innerText || "").split("\\n").map(clean).filter(Boolean);
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const jsonLd = [];
    for (const node of scripts) {
      try {
        const value = JSON.parse(node.textContent || "");
        if (Array.isArray(value)) jsonLd.push(...value); else jsonLd.push(value);
      } catch {}
    }
    const p = jsonLd.find((x) => x && x["@type"] === "Product") || {};
    const offers = p.offers || {};
    const agg = p.aggregateRating || {};
    const meta = document.querySelector('meta[property="og:title"]');
    const metaTitle = meta ? meta.getAttribute("content") : document.title;
    const name = clean(p.name) || clean(metaTitle).replace(/\\s*\\|\\s*Shopee.*$/i, "");
    const price = parse(offers.price) ?? parse(lines.find((x) => /฿|บาท/.test(x)));
    const sellerNode = document.querySelector('[data-sqe="shop-name"], [data-testid="shop-name"], [class*="shop-name"], [class*="ShopName"]');
    const seller = sellerNode ? clean(sellerNode.textContent) : "";
    const sold = lines.find((x) => /ขายแล้ว|sold/i.test(x));
    const salesMatch = sold ? sold.match(/(?:ขายแล้ว|sold)[^0-9]*([0-9,.]+\\s*[KkMm]?)/i) : null;
    const promos = lines.filter((x) => /คูปอง|coupon|voucher|โค้ด|โปรโมชั่น|ส่งฟรี/i.test(x) && x.length < 220);
    const imageNode = document.querySelector('meta[property="og:image"]');
    return {
      name,
      price,
      seller: seller || undefined,
      rating: parse(agg.ratingValue),
      reviewCount: parse(agg.reviewCount ?? agg.ratingCount),
      salesCount: parse(salesMatch ? salesMatch[1] : undefined),
      promotion: promos.join(" | ") || undefined,
      image: imageNode ? imageNode.getAttribute("content") || undefined : undefined,
    };
  })()`);

  const data = result as Partial<Product>;
  if (!data.name) return undefined;
  return data;
}
