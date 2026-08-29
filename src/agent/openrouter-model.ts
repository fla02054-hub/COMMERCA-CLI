const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type ModelInfo = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
};

export async function discoverModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`OpenRouter model discovery failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { data?: ModelInfo[] };
  return payload.data ?? [];
}

export function rankModels(models: ModelInfo[]): ModelInfo[] {
  const score = (m: ModelInfo) => {
    const text = `${m.id} ${m.name ?? ""}`.toLowerCase();
    let value = 0;
    if (text.includes(":free")) value += 100;
    if (text.includes("gemini")) value += 80;
    if (text.includes("flash")) value += 20;
    if (text.includes("qwen") || text.includes("deepseek") || text.includes("llama") || text.includes("gemma")) value += 10;
    return value;
  };
  return [...models].sort((a, b) => score(b) - score(a));
}

export async function selectFreeModels(apiKey: string): Promise<ModelInfo[]> {
  const free = (await discoverModels(apiKey)).filter((m) => m.id.endsWith(":free"));
  const ranked = rankModels(free);
  if (!ranked.length) throw new Error("OpenRouter returned no free models.");
  return ranked;
}

export async function selectFreeModel(apiKey: string): Promise<ModelInfo> {
  return (await selectFreeModels(apiKey))[0];
}

export { OPENROUTER_URL };
