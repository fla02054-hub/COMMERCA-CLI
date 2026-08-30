import assert from "node:assert/strict";
import test from "node:test";
import { produceCreative } from "../src/production/index.js";
import type { CreativeStrategy } from "../src/runtime/stage-artifacts.js";

const creative: CreativeStrategy = {
  image: ["image prompt 1", "image prompt 2"],
  video: ["video prompt"],
  storyboard: ["scene 1", "scene 2"],
  prompt: ["master prompt"],
  voiceScript: ["voice 1", "voice 2", "voice 3", "voice 4", "voice 5"],
  subtitleScript: ["sub 1", "sub 2", "sub 3", "sub 4", "sub 5"],
};

test("production executes image, video, voice, subtitle and editing adapters", async () => {
  const calls: string[] = [];
  const result = await produceCreative(creative, {
    renderImage: async (prompt) => { calls.push(`image:${prompt}`); return `image://${prompt}`; },
    renderVideo: async (prompt) => { calls.push(`video:${prompt}`); return `video://${prompt}`; },
    generateVoice: async (text) => { calls.push(`voice:${text}`); return "voice://1"; },
    generateSubtitle: async (text) => { calls.push(`subtitle:${text}`); return "subtitle://1"; },
  });
  assert.deepEqual(result.image, ["image://image prompt 1", "image://image prompt 2"]);
  assert.deepEqual(result.video, ["video://video prompt"]);
  assert.equal(result.voice, "voice://1");
  assert.equal(result.subtitle, "subtitle://1");
  assert.deepEqual(result.editing, { storyboard: creative.storyboard, prompts: creative.prompt });
  assert.equal(calls.length, 5);
  assert.equal(calls.find((call) => call.startsWith("voice:"))?.includes("scene 1"), false);
  assert.equal(calls.find((call) => call.startsWith("subtitle:"))?.includes("scene 1"), false);
});

test("production refuses to fall back from missing scripts to storyboard", async () => {
  const incomplete = { ...creative, voiceScript: undefined, subtitleScript: undefined };
  await assert.rejects(() => produceCreative(incomplete), /exactly 5 voice-script lines/);
});
