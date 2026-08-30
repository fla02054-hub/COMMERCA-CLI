const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export type ModelInfo = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
};

export async function discoverModels(apiKey: string): Promise<ModelInfo[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`OpenRouter model discovery failed: ${response.status} ${await response.text()}`);
  const payload = await response.json() as { data?: ModelInfo[] };
  return payload.data ?? [];
}

function supportsTools(model: ModelInfo): boolean {
  const params = model.supported_parameters ?? [];
  return params.length === 0 || params.includes("tools") || params.includes("tool_choice");
}

export function rankModels(models: ModelInfo[]): ModelInfo[] {
  const score = (m: ModelInfo) => {
    const text = `${m.id} ${m.name ?? ""}`.toLowerCase();
    let value = 0;
    if (text === "openrouter/free") value += 160;
    if (text.includes(":free")) value += 100;
    if (text.includes("gemini")) value += 90;
    if (text.includes("flash")) value += 25;
    if (text.includes("gemma")) value += 20;
    if (text.includes("qwen") || text.includes("deepseek") || text.includes("llama")) value += 10;
    if (supportsTools(m)) value += 50;
    return value;
  };
  return [...models].sort((a, b) => score(b) - score(a));
}

export async function selectFreeModels(apiKey: string): Promise<ModelInfo[]> {
  const discovered = await discoverModels(apiKey);
  const free = discovered.filter((m) => m.id.endsWith(":free") && supportsTools(m));
  const ranked = rankModels(free);
  // OpenRouter's free router is explicitly designed to select models that support
  // the requested features, including tool calling, so it is a safe final fallback.
  if (!ranked.some((m) => m.id === "openrouter/free")) ranked.push({ id: "openrouter/free" });
  return ranked;
}

export async function selectFreeModel(apiKey: string): Promise<ModelInfo> {
  return (await selectFreeModels(apiKey))[0];
}

export { OPENROUTER_URL };
