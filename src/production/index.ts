import type { CreativeStrategy, ProductionPackage } from "../runtime/stage-artifacts.js";
import { buildEditingManifest, buildSubtitle, geminiImage, geminiVideo, geminiVoice } from "./gemini.js";

export interface ProductionOptions {
  renderImage?: (prompt: string) => Promise<unknown>;
  renderVideo?: (prompt: string) => Promise<unknown>;
  generateVoice?: (text: string) => Promise<unknown>;
  generateSubtitle?: (text: string) => Promise<unknown>;
  edit?: (input: { image: unknown; video: unknown; voice: unknown; subtitle: unknown }) => Promise<unknown>;
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
  const editing = options.edit ? await options.edit(editingInput) : useGemini ? buildEditingManifest(editingInput) : { storyboard: creative.storyboard, prompts: creative.prompt };
  return { image, video, voice, subtitle, editing };
}
