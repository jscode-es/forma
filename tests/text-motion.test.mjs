import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const engine = require("../engines/text-motion/main.cjs");
const { animationClip } = require("../dist-electron/animation-schema.js");

function rigFile() {
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" },
    nodes: [
      { name: "Hips", translation: [0, 1, 0], children: [1, 2] },
      { name: "Spine", translation: [0, 0.2, 0] },
      { name: "RightUpperArm", translation: [-0.2, 0.4, 0], rotation: [0, 0, -0.7071068, 0.7071068] },
    ],
    skins: [{ joints: [0, 1, 2] }],
  }));
  const padded = Buffer.concat([json, Buffer.alloc(-json.length & 3, 0x20)]);
  const header = Buffer.alloc(20);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + padded.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const file = join(mkdtempSync(join(tmpdir(), "forma-motion-")), "rig.glb");
  writeFileSync(file, Buffer.concat([header, padded]));
  return file;
}

test("reads the skin, describes local axes and restricts the plan schema to its bones", () => {
  const rig = engine.readRig(rigFile());
  assert.deepEqual(rig.bones.map((bone) => [bone.name, bone.parent]), [["Hips", null], ["Spine", "Hips"], ["RightUpperArm", "Hips"]]);
  const prompt = engine.buildPrompt("waves", rig, 48);
  assert.match(prompt, /RightUpperArm \(parent Hips\): local X→/);
  assert.match(prompt, /48 frames at 24 FPS/);
  assert.deepEqual(engine.planSchema(rig, 48).properties.keys.items.properties.bone.enum, ["Hips", "Spine", "RightUpperArm"]);
});

test("turns a valid plan into a clip the app accepts", () => {
  const rig = engine.readRig(rigFile());
  const plan = engine.validatePlan({ name: "Wave", keys: [{ bone: "RightUpperArm", frame: 12, rotation: [0, 0, 80] }, { bone: "RightUpperArm", frame: 24, rotation: [0, 0, 40] }, { bone: "Spine", frame: 0, rotation: [5, 0, 0] }] }, rig, 48);
  const clip = engine.toClip(plan, rig, 48);
  assert.equal(animationClip.safeParse(clip).success, true);
  const arm = clip.tracks.find((track) => track.bone === "RightUpperArm");
  assert.deepEqual(arm.keys.map((key) => key.frame), [0, 12, 24]);
  assert.deepEqual(arm.keys[0].value.map((v) => Number(v.toFixed(5))), [0, 0, -0.70711, 0.70711]);
});

test("rejects unknown bones, duplicates, extra fields and out-of-range values", () => {
  const rig = engine.readRig(rigFile());
  const bad = [
    { name: "x", keys: [{ bone: "Tail", frame: 0, rotation: [0, 0, 0] }] },
    { name: "x", keys: [{ bone: "Spine", frame: 1, rotation: [0, 0, 0] }, { bone: "Spine", frame: 1, rotation: [1, 0, 0] }] },
    { name: "x", keys: [{ bone: "Spine", frame: 1, rotation: [0, 0, 0], code: "rm -rf" }] },
    { name: "x", keys: [{ bone: "Spine", frame: 99, rotation: [0, 0, 0] }] },
    { name: "x", keys: [{ bone: "Spine", frame: 1, rotation: [270, 0, 0] }] },
  ];
  for (const plan of bad) assert.throws(() => engine.validatePlan(plan, rig, 48), /motion-plan-invalid/);
});

test("matches the editor's EulerXYZ convention", () => {
  const q = engine.eulerXYZ([90, 0, 0]);
  assert.deepEqual(q.map((v) => Number(v.toFixed(5))), [0.70711, 0, 0, 0.70711]);
});
