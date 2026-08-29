const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type ModelInfo = { id: string; name?: string; context_length?: number; pricing?: { prompt?: string; completion?: string }; architecture?: { input_modalities?: string[] } };

export async function selectFreeModel(apiKey: string): Promise<ModelInfo> {
  const response = await fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`OpenRouter model discovery failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { data?: ModelInfo[] };
  const free = (payload.data ?? []).filter((m) => m.id.endsWith(":free"));
  const preferred = free.find((m) => /qwen|deepseek|gemma|llama/i.test(`${m.id} ${m.name ?? ""}`)) ?? free[0];
  if (!preferred) throw new Error("OpenRouter returned no free models.");
  return preferred;
}

export { OPENROUTER_URL };
