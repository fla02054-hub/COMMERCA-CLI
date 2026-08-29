import type { CreativeStrategy, ProductionPackage } from "../runtime/stage-artifacts.js";

export interface ProductionOptions {
  renderImage?: (prompt: string) => Promise<unknown>;
  renderVideo?: (prompt: string) => Promise<unknown>;
  generateVoice?: (text: string) => Promise<unknown>;
  generateSubtitle?: (text: string) => Promise<unknown>;
}

export async function produceCreative(creative: CreativeStrategy, options: ProductionOptions = {}): Promise<ProductionPackage> {
  const image = options.renderImage ? await Promise.all(creative.image.map(options.renderImage)) : creative.image;
  const video = options.renderVideo ? await Promise.all(creative.video.map(options.renderVideo)) : creative.video;
  const voice = options.generateVoice ? await options.generateVoice(creative.storyboard.join("\n")) : creative.storyboard.join("\n");
  const subtitle = options.generateSubtitle ? await options.generateSubtitle(creative.storyboard.join("\n")) : creative.storyboard;
  return { image, video, voice, subtitle, editing: { storyboard: creative.storyboard, prompts: creative.prompt } };
}
