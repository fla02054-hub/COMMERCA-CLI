const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function key(): string {
  const value = process.env.GEMINI_API_KEY;
  if (!value) throw new Error("GEMINI_API_KEY is required for Gemini production.");
  return value;
}

async function jsonRequest(path: string, body: unknown): Promise<any> {
  const response = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: { "x-goog-api-key": key(), "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Gemini production request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

export async function geminiImage(prompt: string): Promise<{ provider: "gemini"; model: string; mimeType: string; data: string }> {
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
  const result = await jsonRequest("/interactions", { model, input: prompt, response_format: { type: "image", mime_type: "image/png", aspect_ratio: "9:16", image_size: "1K" } });
  const data = result.output_image?.data;
  if (!data) throw new Error("Gemini image generation returned no image.");
  return { provider: "gemini", model, mimeType: result.output_image.mime_type ?? "image/png", data };
}

export async function geminiVoice(text: string): Promise<{ provider: "gemini"; model: string; mimeType: string; data: string }> {
  const model = process.env.GEMINI_TTS_MODEL ?? "gemini-3.1-flash-tts-preview";
  const result = await jsonRequest("/interactions", { model, input: `Synthesize this narration naturally in Thai. Do not add or remove words.\n\n${text}`, response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: process.env.GEMINI_TTS_VOICE ?? "Kore" }] } });
  const audio = result.output_audio?.data;
  if (!audio) throw new Error("Gemini TTS returned no audio.");
  return { provider: "gemini", model, mimeType: result.output_audio.mime_type ?? "audio/wav", data: audio };
}

export async function geminiVideo(prompt: string): Promise<{ provider: "gemini"; model: string; uri: string }> {
  const model = process.env.GEMINI_VIDEO_MODEL ?? "veo-3.1-generate-preview";
  const started = await jsonRequest(`/models/${encodeURIComponent(model)}:predictLongRunning`, { instances: [{ prompt }], parameters: { aspectRatio: "9:16" } });
  const operationName = started.name;
  if (!operationName) throw new Error("Gemini Veo returned no operation name.");
  const deadline = Date.now() + Number(process.env.GEMINI_VIDEO_TIMEOUT_MS ?? 600000);
  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/${operationName}`, { headers: { "x-goog-api-key": key() } });
    if (!response.ok) throw new Error(`Gemini Veo polling failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
    const status = await response.json();
    if (status.error) throw new Error(`Gemini Veo failed: ${JSON.stringify(status.error)}`);
    if (status.done) {
      const uri = status.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!uri) throw new Error("Gemini Veo completed without a video URI.");
      return { provider: "gemini", model, uri };
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error("Gemini Veo generation timed out.");
}

export function buildSubtitle(lines: string[]): string {
  const safe = lines.slice(0, 5).map((line) => line.trim()).filter(Boolean);
  const duration = 10 / Math.max(1, safe.length);
  return safe.map((line, index) => {
    const start = index * duration;
    const end = (index + 1) * duration;
    const stamp = (seconds: number) => {
      const whole = Math.floor(seconds);
      const millis = Math.round((seconds - whole) * 1000);
      return `00:00:${String(whole).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
    };
    return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\n${line}\n`;
  }).join("\n");
}

export function buildEditingManifest(input: { image: unknown; video: unknown; voice: unknown; subtitle: string }) {
  return { type: "editing-manifest", sequence: ["video", "voice", "subtitle"], image: input.image, video: input.video, voice: input.voice, subtitle: input.subtitle, status: "ready-for-render" };
}
