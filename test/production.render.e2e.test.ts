import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFinalMp4 } from "../src/production/ffmpeg.ts";

const execFileAsync = promisify(execFile);

test("Production 10 renders a real final MP4 with FFmpeg", async () => {
  const dir = await mkdtemp(join(tmpdir(), "commerca-production-"));
  const video = join(dir, "video.mp4");
  const voice = join(dir, "voice.wav");
  const subtitle = join(dir, "subtitle.srt");
  const output = join(dir, "final.mp4");

  await execFileAsync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "color=c=black:s=720x1280:d=2", "-r", "30", "-pix_fmt", "yuv420p", video,
  ]);
  await execFileAsync("ffmpeg", [
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

  const probe = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=format_name", "-of", "default=noprint_wrappers=1:nokey=1", output]);
  assert.match(probe.stdout, /mp4/i);
});
