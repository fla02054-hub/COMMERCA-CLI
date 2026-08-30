import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CreativeStrategy, ProductionPackage } from "../runtime/stage-artifacts.js";
import { buildEditingManifest, buildSubtitle, geminiImage, geminiVideo, geminiVoice } from "./gemini.js";
import { renderFinalMp4 } from "./ffmpeg.js";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

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

function resolveFfmpeg(): string { return process.env.FFMPEG_BIN?.trim() || ffmpegStatic || "ffmpeg"; }

async function runLocalFfmpeg(args: string[]): Promise<void> {
  try { await execFileAsync(resolveFfmpeg(), args); }
  catch (error) { throw new Error(`Local FFmpeg production failed: ${error instanceof Error ? error.message : String(error)}`); }
}

async function produceLocalCreative(creative: CreativeStrategy, outputDir: string): Promise<ProductionPackage> {
  await mkdir(outputDir, { recursive: true });
  const videoPath = join(outputDir, "video-1.mp4");
  const voicePath = join(outputDir, "voice.wav");
  const subtitlePath = join(outputDir, "subtitles.srt");
  const outputPath = process.env.COMMERCA_OUTPUT_MP4 ?? join(outputDir, "final.mp4");
  const duration = 10;

  await runLocalFfmpeg(["-y", "-f", "lavfi", "-i", `color=c=black:s=720x1280:d=${duration}`, "-r", "30", "-pix_fmt", "yuv420p", videoPath]);
  await runLocalFfmpeg(["-y", "-f", "lavfi", "-i", `sine=frequency=880:duration=${duration}`, "-ar", "44100", voicePath]);
  await writeFile(subtitlePath, buildSubtitle(creative.subtitleScript ?? ["ดูสินค้า", "จุดเด่น", "รายละเอียด", "ราคาและโปร", "ดูคอมเมนต์"]), "utf8");
  const finalMp4 = await renderFinalMp4({ videoPath, voicePath, subtitlePath, outputPath });
  return {
    image: creative.image,
    video: creative.video,
    voice: creative.voiceScript ?? [],
    subtitle: creative.subtitleScript ?? [],
    editing: { type: "editing-manifest", sequence: ["video", "voice", "subtitle"], storyboard: creative.storyboard, prompts: creative.prompt, finalMp4, status: "rendered", localVideoPath: videoPath, localVoicePath: voicePath, localSubtitlePath: subtitlePath },
  };
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

  const outputDir = process.env.COMMERCA_OUTPUT_DIR ?? "./output";
  if (!useGemini && !options.renderImage && !options.renderVideo && !options.generateVoice && !options.edit) return produceLocalCreative(creative, outputDir);

  const rawImage = renderImage ? await Promise.all(creative.image.map(renderImage)) : creative.image;
  const rawVideo = renderVideo ? await Promise.all(creative.video.map(renderVideo)) : creative.video;
  const voiceScript = creative.voiceScript?.length ? creative.voiceScript : creative.storyboard;
  const subtitleScript = creative.subtitleScript?.length ? creative.subtitleScript : ["ดูสินค้า", "จุดเด่น", "รายละเอียด", "ราคาและโปร", "ดูคอมเมนต์"];
  const narration = voiceScript.join("\n");
  const rawVoice = generateVoice ? await generateVoice(narration) : narration;
  const subtitle = options.generateSubtitle ? await options.generateSubtitle(subtitleScript.join("\n")) : useGemini ? buildSubtitle(subtitleScript) : subtitleScript;
  const image = useGemini ? await Promise.all(rawImage.map((value, i) => materializeMedia(value, join(outputDir, `image-${i + 1}.png`)))) : rawImage;
  const video = useGemini ? await Promise.all(rawVideo.map((value, i) => materializeMedia(value, join(outputDir, `video-${i + 1}.mp4`)))) : rawVideo;
  const voice = useGemini ? await materializeMedia(rawVoice, join(outputDir, "voice.wav")) : rawVoice;
  const subtitlePath = useGemini && typeof subtitle === "string" ? join(outputDir, "subtitles.srt") : filePath(subtitle);
  if (useGemini && typeof subtitle === "string") { await mkdir(dirname(subtitlePath), { recursive: true }); await writeFile(subtitlePath, subtitle, "utf8"); }

  const editingInput = { image, video, voice, subtitle: subtitlePath ?? subtitle };
  let editing: unknown;
  if (options.edit) editing = await options.edit(editingInput);
  else if (useGemini) {
    const videoPath = filePath(video[0]);
    const voicePath = filePath(voice);
    const outputPath = process.env.COMMERCA_OUTPUT_MP4 ?? join(outputDir, "final.mp4");
    if (!videoPath) throw new Error("Live production completed generation but no local video file was produced.");
    editing = { ...buildEditingManifest(editingInput), storyboard: creative.storyboard, voiceScript, subtitleScript, finalMp4: await renderFinalMp4({ videoPath, voicePath, subtitlePath, outputPath }), status: "rendered" };
  } else editing = { storyboard: creative.storyboard, prompts: creative.prompt, voiceScript, subtitleScript, status: "ready-for-render" };
  return { image, video, voice, subtitle: subtitlePath ?? subtitle, editing };
}
