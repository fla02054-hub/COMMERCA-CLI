import assert from "node:assert/strict";
import test from "node:test";
import { parseProductSearchArgs } from "../src/cli/product-search.js";

test("product search accepts a natural query", () => {
  assert.deepEqual(parseProductSearchArgs(["DJI"], ["rakatookyang", "shopee-browser"]), {
    mode: "query",
    query: "DJI",
  });
});

test("product search accepts explicit provider syntax", () => {
  assert.deepEqual(
    parseProductSearchArgs(["rakatookyang", "DJI", "Osmo", "Action"], ["rakatookyang", "shopee-browser"]),
    { mode: "provider", provider: "rakatookyang", query: "DJI Osmo Action" },
  );
});

test("product search accepts --provider syntax", () => {
  assert.deepEqual(
    parseProductSearchArgs(["--provider", "shopee-browser", "DJI", "Pocket", "3"], ["rakatookyang", "shopee-browser"]),
    { mode: "provider", provider: "shopee-browser", query: "DJI Pocket 3" },
  );
});

test("product search accepts direct URLs", () => {
  assert.deepEqual(
    parseProductSearchArgs(["https://rakatookyang.com/products/example"], ["rakatookyang"]),
    { mode: "url", url: "https://rakatookyang.com/products/example" },
  );
});

test("product search accepts --url syntax", () => {
  assert.deepEqual(
    parseProductSearchArgs(["--url", "https://rakatookyang.com/products/example"], ["rakatookyang"]),
    { mode: "url", url: "https://rakatookyang.com/products/example" },
  );
});

test("unknown first token remains a query instead of being rejected as a provider", () => {
  assert.deepEqual(
    parseProductSearchArgs(["Nintendo", "Switch", "2"], ["rakatookyang", "shopee-browser"]),
    { mode: "query", query: "Nintendo Switch 2" },
  );
});
