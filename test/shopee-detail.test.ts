import assert from "node:assert/strict";
import test from "node:test";
import { resolveShopeeUrl } from "../src/product/shopee-detail.js";

const originalFetch = globalThis.fetch;

test("Shopee short link resolves through redirect chain", async () => {
  const calls: string[] = [];
  let first = true;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${url}|${init?.redirect ?? "default"}`);
    if (first) {
      first = false;
      return new Response(null, { status: 200 });
    }
    return new Response(null, {
      status: 302,
      headers: { location: "https://shopee.co.th/product-name-i.123.456" },
    });
  };

  try {
    const resolved = await resolveShopeeUrl("https://s.shopee.co.th/2qUA6EnWAX");
    assert.equal(resolved, "https://shopee.co.th/product-name-i.123.456");
    assert.deepEqual(calls, [
      "https://s.shopee.co.th/2qUA6EnWAX|follow",
      "https://s.shopee.co.th/2qUA6EnWAX|manual",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("non-short Shopee URLs are not fetched just to resolve them", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response(null, { status: 200 });
  };

  try {
    const url = "https://shopee.co.th/product-name-i.123.456";
    assert.equal(await resolveShopeeUrl(url), url);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
