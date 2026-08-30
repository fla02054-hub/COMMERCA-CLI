import { execFile } from "node:child_process";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
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

async function renderFixture() {
  const dir = await mkdtemp(join(tmpdir(), "commerca-qc-"));
  const video = join(dir, "video.mp4");
  const voice = join(dir, "voice.wav");
  const subtitle = join(dir, "subtitle.srt");
  const output = join(dir, "final.mp4");

  await runFfmpeg(["-y", "-f", "lavfi", "-i", "color=c=black:s=720x1280:d=2", "-r", "30", "-pix_fmt", "yuv420p", video]);
  await runFfmpeg(["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", "-ar", "44100", voice]);
  await writeFile(subtitle, "1\n00:00:00,000 --> 00:00:02,000\nCOMMERCA QC TEST\n");
  await renderFinalMp4({ videoPath: video, voicePath: voice, subtitlePath: subtitle, outputPath: output });
  return output;
}

test("07 QC passes only when final.mp4 is a readable MP4 with a video stream", async () => {
  const output = await renderFixture();
  const result = await stat(output);
  assert.ok(result.size > 1000, "final.mp4 must contain encoded media");
  await runFfmpeg(["-v", "error", "-i", output, "-map", "0:v:0", "-f", "null", "-"]);
});

test("07 QC rejects an invalid final.mp4", async () => {
  const dir = await mkdtemp(join(tmpdir(), "commerca-qc-invalid-"));
  const invalid = join(dir, "final.mp4");
  await writeFile(invalid, "not an mp4");
  await assert.rejects(
    runFfmpeg(["-v", "error", "-i", invalid, "-map", "0:v:0", "-f", "null", "-"]),
  );
});
