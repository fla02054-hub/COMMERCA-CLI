import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

export interface RenderInput {
  videoPath: string;
  voicePath?: string;
  subtitlePath?: string;
  outputPath: string;
}

function resolveFfmpegBin(): string {
  const configured = process.env.FFMPEG_BIN?.trim();
  if (configured) return configured;
  if (ffmpegStatic) return ffmpegStatic;
  return "ffmpeg";
}

export function renderFinalMp4(input: RenderInput): Promise<string> {
  const args = ["-y", "-i", input.videoPath];
  if (input.voicePath) args.push("-i", input.voicePath);
  const filters: string[] = [];
  if (input.subtitlePath) filters.push(`subtitles=${input.subtitlePath.replace(/\\/g, "/").replace(/:/g, "\\:")}`);
  if (filters.length) args.push("-vf", filters.join(","));
  if (input.voicePath) args.push("-map", "0:v:0", "-map", "1:a:0", "-c:a", "aac", "-shortest");
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", input.outputPath);

  const bin = resolveFfmpegBin();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => reject(new Error(`Unable to start FFmpeg (${bin}): ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve(input.outputPath);
      else reject(new Error(`FFmpeg render failed (${code}): ${stderr.slice(-1000)}`));
    });
  });
}
