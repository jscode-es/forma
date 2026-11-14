import assert from "node:assert/strict";
import test from "node:test";
import { animationClip } from "../electron/animation-schema.ts";
import { jobRequest } from "../electron/schemas.ts";
import { retargetAnimationClip, validateAnimationClip } from "../src/feature/animation/operations.ts";

const bone = (name, parent, translation) => ({ name, parent, translation, rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
const bones = [bone("Hips", null, [0, 1, 0]), bone("Head", "Hips", [0, 1, 0])];
const clip = { version: 1, name: "Wave", fps: 30, durationFrames: 30, bones, tracks: [{ bone: "Head", path: "rotation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 0, 0, 1] }, { frame: 15.5, value: [0, 0, 0, 1] }] }] };

test("renderer and main accept bounded clips with fractional keys and reject malformed payloads", () => {
  assert.deepEqual(animationClip.parse(clip), validateAnimationClip(clip));
  const invalid = [null, {}, { ...clip, tracks: [] }, { ...clip, fps: 30.5 }, { ...clip, fps: 121 }, { ...clip, durationFrames: 72001 }, { ...clip, bones: [bones[0], bones[0]] }, { ...clip, bones: [{ ...bones[0], parent: "Head" }, bones[1]] }, { ...clip, bones: [{ ...bones[0], parent: "Missing" }, bones[1]] }, { ...clip, tracks: [clip.tracks[0], clip.tracks[0]] }, { ...clip, tracks: [{ ...clip.tracks[0], bone: "Missing" }] }, { ...clip, tracks: [{ ...clip.tracks[0], keys: [{ frame: 31, value: [0, 0, 0, 1] }] }] }, { ...clip, tracks: [{ ...clip.tracks[0], keys: [{ frame: 0, value: [0, 0, 0, 2] }] }] }, { ...clip, tracks: [{ ...clip.tracks[0], keys: [{ frame: 2, value: [0, 0, 0, 1] }, { frame: 1, value: [0, 0, 0, 1] }] }] }, { ...clip, tracks: [{ ...clip.tracks[0], keys: [{ frame: 1, value: [0, 0, 0, 1] }, { frame: 1, value: [0, 0, 0, 1] }] }] }, { ...clip, tracks: [{ ...clip.tracks[0], path: "scale", keys: [{ frame: 0, value: [1, 0, 1] }] }] }];
  for (const value of invalid) {
    assert.equal(animationClip.safeParse(value).success, false, JSON.stringify(value));
    assert.throws(() => validateAnimationClip(value), /animation.invalidClip/);
  }
});

test("source video requests reject filesystem paths, multiple videos and oversized labels", () => {
  const source = { stagingId: "00000000-0000-4000-8000-000000000001", name: "Walk.webm" };
  const request = { task: "video-to-motion", engineId: "motion-test", projectId: null, parameters: {}, images: [], models: [], videos: [source] };
  assert.equal(jobRequest.parse(request).videos[0].stagingId, source.stagingId);
  for (const videos of [[{ ...source, stagingId: "../outside" }], [{ ...source, stagingId: "C:/Windows/file" }], [{ ...source, name: "x".repeat(121) }], [source, source]]) assert.equal(jobRequest.safeParse({ ...request, videos }).success, false);
});

test("retarget rejects incomplete, duplicate and incompatible mappings", () => {
  const target = bones.map((b) => ({ ...b, name: `Target${b.name}`, parent: b.parent && `Target${b.parent}` }));
  assert.throws(() => retargetAnimationClip(clip, target, { Hips: "TargetHips" }), /invalidMapping/);
  assert.throws(() => retargetAnimationClip(clip, target, { Hips: "TargetHips", Head: "TargetHips" }), /invalidMapping/);
  assert.throws(() => retargetAnimationClip(clip, target.map((b) => ({ ...b, parent: null })), { Hips: "TargetHips", Head: "TargetHead" }), /incompatibleRig/);
});

test("renderer and main reject Unicode clips over the native UTF-8 file limit", () => {
  const limit = 4 * 1024 * 1024;
  const unicodeBones = Array.from({ length: 256 }, (_, index) => bone(`${"\u9aa8".repeat(115)}${index}`, null, [0, 1, 0]));
  const makeClip = (count) => {
    const keys = Array.from({ length: count }, (_, frame) => ({ frame, value: [0, 0, 0, 1] }));
    return { ...clip, name: "\u52d5\u4f5c", durationFrames: 10000, bones: unicodeBones, tracks: unicodeBones.slice(0, 16).map((b) => ({ bone: b.name, path: "rotation", interpolation: "LINEAR", keys })) };
  };
  let low = 1, high = 10000;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (JSON.stringify(makeClip(middle)).length <= limit) low = middle;
    else high = middle - 1;
  }
  const oversized = makeClip(low);
  const serialized = JSON.stringify(oversized);
  assert.ok(serialized.length <= limit);
  assert.ok(new TextEncoder().encode(serialized).byteLength > limit);
  const ascii = { ...oversized, name: "Motion", bones: unicodeBones.map((b, index) => ({ ...b, name: `Bone${index}` })), tracks: oversized.tracks.map((track, index) => ({ ...track, bone: `Bone${index}` })) };
  assert.equal(animationClip.safeParse(ascii).success, true);
  assert.doesNotThrow(() => validateAnimationClip(ascii));
  assert.equal(animationClip.safeParse(oversized).success, false);
  assert.throws(() => validateAnimationClip(oversized), /animation.invalidClip/);
});

