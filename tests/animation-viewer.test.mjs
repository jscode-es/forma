import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Quaternion, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/feature/viewport/engine/viewer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/from "(three[^\"]*)"/g, (_, name) => `from "${name === "three" ? import.meta.resolve("three") : pathToFileURL(require.resolve(name)).href}"`);
const { Viewer } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function sampleTrack(track, frame) {
  const a = track.keys[0].value;
  const b = track.keys[1].value;
  const amount = Math.max(0, Math.min(1, frame / 30));
  if (track.path === "rotation") return new Quaternion().fromArray(a).slerp(new Quaternion().fromArray(b), amount).toArray();
  return a.map((value, index) => value + (b[index] - value) * amount);
}

function fixture() {
  const model = new Group();
  const bone = new Bone();
  bone.name = "joint";
  bone.userData.formaJointIndex = 0;
  const untouched = new Bone();
  untouched.name = "untouched";
  untouched.userData.formaJointIndex = 1;
  untouched.position.set(0, 2, 0);
  untouched.scale.set(2, 1, 1);
  bone.add(untouched);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([1, 0, 0], 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0], 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0], 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.add(bone);
  model.add(mesh);
  model.updateMatrixWorld(true);
  mesh.bind(new Skeleton([bone, untouched]));
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    model, scene: new Scene(), root: new Group(), rig: null, rigBones: new Map(), rigWeights: new Map(), rigOverlay: new Group(), rigBounds: null,
    animation: null, animationFrame: 0, animationTick: null, animationReportedFrame: null, animationReportedAt: -Infinity,
    paint: null, paintMaterials: new Map(), paintTextures: new Set(), paintPointer: null, viewMode: "material", requestRender() {},
  });
  const draft = { version: 1, name: "move", fps: 30, durationFrames: 30, bones: [
    { name: "joint", parent: null, translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { name: "untouched", parent: "joint", translation: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [2, 1, 1] },
  ], tracks: [
    { bone: "joint", path: "translation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 0, 0] }, { frame: 30, value: [2, 0, 0] }] },
    { bone: "joint", path: "rotation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 0, 0, 1] }, { frame: 30, value: [0, 0, 1, 0] }] },
  ] };
  const frames = [];
  const config = { draft, frame: 0, playing: false, loop: false, speed: 1, sampleTrack, onFrame: (frame, playing) => frames.push([frame, playing]) };
  return { viewer, mesh, bone, untouched, geometry, config, frames };
}

const rig = (changes = {}) => ({ guides: {}, showGuides: false, showBones: false, showWeights: false, selectedBone: 0, pose: [0, 0, 90], ...changes });

test("animation scrubbing changes actual skin translation and rotation without accumulating transforms", () => {
  const { viewer, mesh, bone, untouched, geometry, config } = fixture();
  viewer.configureAnimation({ ...config, frame: 15 });
  mesh.skeleton.update();
  assert.ok(mesh.applyBoneTransform(0, new Vector3(1, 0, 0)).distanceTo(new Vector3(1, 1, 0)) < 1e-6);
  const rotation = bone.quaternion.clone();
  viewer.configureRig(rig());
  viewer.configureAnimation({ ...config, frame: 15 });
  assert.ok(bone.quaternion.angleTo(rotation) < 1e-6);
  assert.deepEqual(untouched.position.toArray(), [0, 2, 0]);
  assert.deepEqual(untouched.scale.toArray(), [2, 1, 1]);
  assert.equal(mesh.geometry, geometry);
  viewer.configureAnimation({ ...config, frame: 0 });
  assert.deepEqual(bone.position.toArray(), [0, 0, 0]);
  assert.ok(bone.quaternion.angleTo(new Quaternion()) < 1e-6);
});

test("playback uses elapsed time and speed, throttles notifications, and holds the final frame", () => {
  const { viewer, bone, config, frames } = fixture();
  viewer.configureAnimation({ ...config, playing: true, speed: 2 });
  viewer.advanceAnimation(100);
  viewer.advanceAnimation(110);
  assert.equal(frames.length, 1);
  viewer.advanceAnimation(350);
  assert.ok(Math.abs(viewer.animationFrame - 15) < 1e-9);
  viewer.advanceAnimation(600);
  assert.equal(viewer.animationFrame, 30);
  assert.equal(viewer.animation.playing, false);
  assert.deepEqual(frames.at(-1), [30, false]);
  assert.deepEqual(bone.position.toArray(), [2, 0, 0]);
  viewer.advanceAnimation(1000);
  assert.equal(viewer.animationFrame, 30);
});

test("looping and store frame acknowledgements preserve the playback clock and fractional progress", () => {
  const { viewer, config } = fixture();
  let current = { ...config, playing: true, loop: true };
  current.onFrame = (frame, playing) => {
    current = { ...current, frame, playing };
    viewer.configureAnimation(current);
  };
  viewer.configureAnimation(current);
  viewer.advanceAnimation(0);
  viewer.advanceAnimation(500);
  assert.ok(Math.abs(viewer.animationFrame - 15) < 1e-9);
  viewer.advanceAnimation(1250);
  assert.equal(viewer.animationFrame, 7.5);
  viewer.advanceAnimation(1260);
  viewer.configureAnimation({ ...current, speed: 2 });
  assert.ok(Math.abs(viewer.animationFrame - 7.8) < 1e-9);
  viewer.advanceAnimation(1500);
  assert.ok(Math.abs(viewer.animationFrame - 22.2) < 1e-9);
  viewer.configureAnimation({ ...current, frame: 5, playing: false });
  assert.equal(viewer.animationFrame, 5);
});

test("clearing animation restores full rest transforms and permits rig pose preview again", () => {
  const { viewer, bone, untouched, config } = fixture();
  viewer.configureRig(rig());
  viewer.configureAnimation({ ...config, frame: 30, playing: true });
  untouched.position.set(9, 9, 9);
  untouched.scale.set(3, 3, 3);
  viewer.configureAnimation(null);
  assert.equal(viewer.animation, null);
  assert.equal(viewer.animationTick, null);
  assert.deepEqual(bone.position.toArray(), [0, 0, 0]);
  assert.ok(bone.quaternion.angleTo(new Quaternion()) < 1e-6);
  assert.deepEqual(untouched.position.toArray(), [0, 2, 0]);
  assert.deepEqual(untouched.scale.toArray(), [2, 1, 1]);
  viewer.advanceAnimation(10000);
  assert.deepEqual(bone.position.toArray(), [0, 0, 0]);
  viewer.configureRig(rig());
  assert.ok(bone.quaternion.angleTo(new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2)) < 1e-6);
});

test("animation preserves rig weights, paint materials and rest guide bounds", () => {
  const { viewer, mesh, config } = fixture();
  const configuration = rig({ showWeights: true, showGuides: true, guides: { hips: [0, .5, 0] } });
  viewer.configureRig(configuration);
  const position = viewer.rigOverlay.children[0].position.toArray();
  const geometry = mesh.geometry;
  const material = mesh.material;
  viewer.configureAnimation({ ...config, frame: 30 });
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  viewer.configureRig(configuration);
  assert.deepEqual(viewer.rigOverlay.children[0].position.toArray(), position);
  assert.equal(mesh.material.vertexColors, true);
});

test("changing the model cancels playback before capturing the new rest skeleton", () => {
  const { viewer, bone, config } = fixture();
  viewer.configureAnimation({ ...config, frame: 30, playing: true });
  const next = new Group();
  const nextBone = new Bone();
  nextBone.name = "joint";
  nextBone.userData.formaJointIndex = 0;
  nextBone.position.y = 3;
  next.add(nextBone);
  Object.assign(viewer, { rebuildGrid() {}, applyIsolation() {}, setCameraPreset() {}, projection: null });
  viewer.setModel(next);
  assert.equal(viewer.animation, null);
  assert.deepEqual(bone.position.toArray(), [0, 0, 0]);
  assert.equal(viewer.rigBones.has(bone), false);
  assert.equal(viewer.rigBones.has(nextBone), true);
  assert.deepEqual(nextBone.position.toArray(), [0, 3, 0]);
  viewer.advanceAnimation(100000);
  assert.deepEqual(nextBone.position.toArray(), [0, 3, 0]);
});


test("render RAF continues during playback and stops scheduling when animation is cleared", () => {
  const { viewer, config } = fixture();
  const originalRequest = globalThis.requestAnimationFrame;
  const pending = [];
  globalThis.requestAnimationFrame = (callback) => { pending.push(callback); return pending.length; };
  try {
    delete viewer.requestRender;
    Object.assign(viewer, { frame: 0, disposed: false, controls: { update: () => false }, renderer: { render() {} } });
    viewer.configureAnimation({ ...config, playing: true });
    assert.equal(pending.length, 1);
    pending[0](0);
    assert.equal(pending.length, 2);
    pending[1](500);
    assert.ok(Math.abs(viewer.animationFrame - 15) < 1e-9);
    assert.equal(pending.length, 3);
    viewer.configureAnimation(null);
    pending[2](1000);
    assert.equal(pending.length, 3);
    assert.equal(viewer.frame, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRequest;
  }
});


test("animation resolves original source names through joint indices after GLTF name sanitization", () => {
  const { viewer, mesh, bone, untouched, config } = fixture();
  bone.name = "Arm_01";
  untouched.name = "other";
  bone.userData.formaJointIndex = 1;
  untouched.userData.formaJointIndex = 0;
  const draft = structuredClone(config.draft);
  draft.bones[0].name = "Arm.01";
  draft.bones[1].parent = "Arm.01";
  draft.bones.reverse();
  draft.tracks.forEach((track) => { track.bone = "Arm.01"; });
  viewer.configureAnimation({ ...config, draft, frame: 15 });
  mesh.skeleton.update();
  assert.deepEqual(bone.position.toArray(), [1, 0, 0]);
  assert.ok(mesh.applyBoneTransform(0, new Vector3(1, 0, 0)).distanceTo(new Vector3(1, 1, 0)) < 1e-6);
  assert.deepEqual(untouched.position.toArray(), [0, 2, 0]);
});
