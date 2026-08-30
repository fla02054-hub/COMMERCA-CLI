import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

async function materializeMedia(value: unknown, file: string): Promise<string | undefined> {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  await mkdir(dirname(file), { recursive: true });
  if (typeof item.data === "string") {
    await writeFile(file, Buffer.from(item.data, "base64"));
    return file;
  }
  if (typeof item.uri === "string") {
    const headers: Record<string, string> = {};
    if (process.env.GEMINI_API_KEY) headers["x-goog-api-key"] = process.env.GEMINI_API_KEY;
    const response = await fetch(item.uri, { headers });
    if (!response.ok) throw new Error(`Unable to download generated media (${response.status}).`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    return file;
  }
  return filePath(value);
}

export async function produceCreative(creative: CreativeStrategy, options: ProductionOptions = {}): Promise<ProductionPackage> {
  const live = process.env.COMMERCA_MODE === "live";
  const useGemini = process.env.COMMERCA_PRODUCTION_PROVIDER === "gemini" || live;
  const renderImage = options.renderImage ?? (useGemini ? geminiImage : undefined);
  const renderVideo = options.renderVideo ?? (useGemini ? geminiVideo : undefined);
  const generateVoice = options.generateVoice ?? (useGemini ? geminiVoice : undefined);
  if (live && !renderImage) throw new Error("Live production requires an image provider.");
  if (live && !renderVideo) throw new Error("Live production requires a video provider.");
  if (live && !generateVoice) throw new Error("Live production requires a voice provider.");

  const rawImage = renderImage ? await Promise.all(creative.image.map(renderImage)) : creative.image;
  const rawVideo = renderVideo ? await Promise.all(creative.video.map(renderVideo)) : creative.video;
  const narration = creative.storyboard.join("\n");
  const rawVoice = generateVoice ? await generateVoice(narration) : narration;
  const subtitle = options.generateSubtitle ? await options.generateSubtitle(narration) : useGemini ? buildSubtitle(creative.storyboard) : creative.storyboard;

  const outputDir = process.env.COMMERCA_OUTPUT_DIR ?? "./output";
  const image = useGemini ? await Promise.all(rawImage.map((value, i) => materializeMedia(value, join(outputDir, `image-${i + 1}.png`))) ) : rawImage;
  const video = useGemini ? await Promise.all(rawVideo.map((value, i) => materializeMedia(value, join(outputDir, `video-${i + 1}.mp4`))) ) : rawVideo;
  const voice = useGemini ? await materializeMedia(rawVoice, join(outputDir, "voice.wav")) : rawVoice;
  const subtitlePath = useGemini && typeof subtitle === "string" ? join(outputDir, "subtitles.srt") : filePath(subtitle);
  if (useGemini && typeof subtitle === "string") {
    await mkdir(dirname(subtitlePath), { recursive: true });
    await writeFile(subtitlePath, subtitle, "utf8");
  }

  const editingInput = { image, video, voice, subtitle: subtitlePath ?? subtitle };
  let editing: unknown;
  if (options.edit) {
    editing = await options.edit(editingInput);
  } else if (useGemini) {
    const videoPath = filePath(video[0]);
    const voicePath = filePath(voice);
    const outputPath = process.env.COMMERCA_OUTPUT_MP4 ?? join(outputDir, "final.mp4");
    if (videoPath) {
      editing = { ...buildEditingManifest(editingInput), finalMp4: await renderFinalMp4({ videoPath, voicePath, subtitlePath, outputPath }), status: "rendered" };
    } else {
      throw new Error("Live production completed generation but no local video file was produced.");
    }
  } else {
    editing = { storyboard: creative.storyboard, prompts: creative.prompt };
  }
  return { image, video, voice, subtitle: subtitlePath ?? subtitle, editing };
}
