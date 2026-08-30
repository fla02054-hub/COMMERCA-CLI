import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import ffmpegStatic from "ffmpeg-static";
import { renderFinalMp4 } from "../src/production/ffmpeg.ts";

const execFileAsync = promisify(execFile);
const ffmpeg = ffmpegStatic ?? process.env.FFMPEG_BIN ?? "ffmpeg";

async function runFfmpeg(args: string[]) {
  return execFileAsync(ffmpeg, args);
}

test("Production 10 renders a real final MP4 with FFmpeg", async () => {
  const dir = await mkdtemp(join(tmpdir(), "commerca-production-"));
  const video = join(dir, "video.mp4");
  const voice = join(dir, "voice.wav");
  const subtitle = join(dir, "subtitle.srt");
  const output = join(dir, "final.mp4");

  await runFfmpeg([
    "-y", "-f", "lavfi", "-i", "color=c=black:s=720x1280:d=2", "-r", "30", "-pix_fmt", "yuv420p", video,
  ]);
  await runFfmpeg([
    "-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-ar", "44100", voice,
  ]);
  await readFile(subtitle).catch(async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(subtitle, "1\n00:00:00,000 --> 00:00:02,000\nCOMMERCA PRODUCTION TEST\n");
  });

  const rendered = await renderFinalMp4({ videoPath: video, voicePath: voice, subtitlePath: subtitle, outputPath: output });
  assert.equal(rendered, output);
  const result = await stat(output);
  assert.ok(result.size > 1000, "final.mp4 must contain real encoded media");

  const probe = await runFfmpeg(["-v", "error", "-i", output, "-map", "0:v:0", "-f", "null", "-"]);
  assert.equal(probe.stderr.trim(), "", "FFmpeg must be able to read the rendered MP4 video stream");
});
