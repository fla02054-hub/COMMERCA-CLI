import assert from "node:assert/strict";
import test from "node:test";
import { OpenRouterBrain } from "../src/agent/openrouter-brain.js";

const originalFetch = globalThis.fetch;

function mockResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("OpenRouter brain uses one key and returns a browser tool call", async () => {
  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  process.env.OPENROUTER_MODELS = "google/gemini-2.5-flash,google/gemini-3-flash-preview";

  globalThis.fetch = async () => mockResponse({
    choices: [{ message: {
      tool_calls: [{ function: { name: "browser", arguments: JSON.stringify({ action: "open", url: "https://www.google.com" }) } }],
    } }],
  });

  try {
    const brain = new OpenRouterBrain();
    const result = await brain.decide({
      goal: "เปิด Google แล้วค้นหา Shopee",
      history: [],
    });
    assert.equal(result.action, "use_tool");
    assert.equal(result.tool, "browser");
    assert.deepEqual(result.input, { action: "open", url: "https://www.google.com" });
    assert.equal(brain.getModel(), "google/gemini-2.5-flash");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_MODELS;
  }
});
