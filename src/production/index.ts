import type { CreativeStrategy, ProductionPackage } from "../runtime/stage-artifacts.js";
import { buildEditingManifest, buildSubtitle, geminiImage, geminiVideo, geminiVoice } from "./gemini.js";
import { renderFinalMp4 } from "./ffmpeg.js";

export interface ProductionOptions {
  renderImage?: (prompt: string) => Promise<unknown>;
  renderVideo?: (prompt: string) => Promise<unknown>;
  generateVoice?: (text: string) => Promise<unknown>;
  generateSubtitle?: (text: string) => Promise<unknown>;
  edit?: (input: { image: unknown; video: unknown; voice: unknown; subtitle: unknown }) => Promise<unknown>;
}

function filePath(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "path" in value && typeof (value as { path?: unknown }).path === "string") return (value as { path: string }).path;
  return undefined;
}

export async function produceCreative(creative: CreativeStrategy, options: ProductionOptions = {}): Promise<ProductionPackage> {
  const useGemini = process.env.COMMERCA_PRODUCTION_PROVIDER === "gemini";
  const renderImage = options.renderImage ?? (useGemini ? geminiImage : undefined);
  const renderVideo = options.renderVideo ?? (useGemini ? geminiVideo : undefined);
  const generateVoice = options.generateVoice ?? (useGemini ? geminiVoice : undefined);
  const image = renderImage ? await Promise.all(creative.image.map(renderImage)) : creative.image;
  const video = renderVideo ? await Promise.all(creative.video.map(renderVideo)) : creative.video;
  const narration = creative.storyboard.join("\n");
  const voice = generateVoice ? await generateVoice(narration) : narration;
  const subtitle = options.generateSubtitle ? await options.generateSubtitle(narration) : useGemini ? buildSubtitle(creative.storyboard) : creative.storyboard;
  const editingInput = { image, video, voice, subtitle };
  let editing: unknown;
  if (options.edit) {
    editing = await options.edit(editingInput);
  } else if (useGemini) {
    const videoPath = filePath(video[0]);
    const voicePath = filePath(voice);
    const subtitlePath = filePath(subtitle);
    const outputPath = process.env.COMMERCA_OUTPUT_MP4;
    if (videoPath && outputPath) {
      editing = { ...buildEditingManifest(editingInput), finalMp4: await renderFinalMp4({ videoPath, voicePath, subtitlePath, outputPath }), status: "rendered" };
    } else {
      editing = buildEditingManifest(editingInput);
    }
  } else {
    editing = { storyboard: creative.storyboard, prompts: creative.prompt };
  }
  return { image, video, voice, subtitle, editing };
}
