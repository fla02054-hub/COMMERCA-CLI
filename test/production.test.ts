import assert from "node:assert/strict";
import test from "node:test";
import { produceCreative } from "../src/production/index.js";
import type { CreativeStrategy } from "../src/runtime/stage-artifacts.js";

const creative: CreativeStrategy = {
  image: ["image prompt 1", "image prompt 2"],
  video: ["video prompt"],
  storyboard: ["scene 1", "scene 2"],
  prompt: ["master prompt"],
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
});

test("production preserves the creative contract when adapters are not configured", async () => {
  const result = await produceCreative(creative);
  assert.deepEqual(result.image, creative.image);
  assert.deepEqual(result.video, creative.video);
  assert.equal(result.voice, creative.storyboard.join("\n"));
  assert.deepEqual(result.subtitle, creative.storyboard);
  assert.deepEqual(result.editing, { storyboard: creative.storyboard, prompts: creative.prompt });
});
