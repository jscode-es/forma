import assert from "node:assert/strict";
import test from "node:test";
import { readAnimationModel, writeAnimationClip, sampleAnimationTrack, retargetAnimationClip, createAnimationPreset, eulerToQuaternion, quaternionToEuler } from "./operations.ts";

function glb(doc, binary = new Uint8Array([7, 8, 9, 10])) {
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const n = Math.ceil(json.length / 4) * 4;
  const bin = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(28 + n + bin);
  const view = new DataView(bytes.buffer);
  [0x46546c67, 2, bytes.length, n, 0x4e4f534a].forEach((v, i) => view.setUint32(i * 4, v, true));
  bytes.fill(32, 20, 20 + n); bytes.set(json, 20);
  view.setUint32(20 + n, bin, true); view.setUint32(24 + n, 0x004e4942, true); bytes.set(binary, 28 + n);
  return bytes;
}
function decode(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = view.getUint32(12, true);
  return { doc: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + n))), bin: bytes.subarray(28 + n) };
}
const bone = (name, parent, translation) => ({ name, parent, translation, rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
const bones = [bone("Hips", null, [0, 1, 0]), bone("Head", "Hips", [0, 1, 0])];
const document = { asset: { version: "2.0" }, nodes: [{ name: "Hips", translation: [0, 1, 0], children: [1] }, { name: "Head", translation: [0, 1, 0] }], skins: [{ joints: [0, 1] }], buffers: [{ byteLength: 4 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], materials: [{ name: "Untouched" }], extensions: { custom: { untouched: true } } };
const clip = { version: 1, name: "Wave", fps: 30, durationFrames: 30, bones, tracks: [{ bone: "Head", path: "rotation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 0, 0, 1] }, { frame: 15.5, value: eulerToQuaternion([0, 0, 90]) }, { frame: 30, value: [0, 0, 0, 1] }] }] };

test("writes real GLB samplers preserving original binary, geometry and unrelated clips", () => {
  const original = glb(document);
  assert.deepEqual(readAnimationModel(original).bones, bones);
  const first = writeAnimationClip(original, clip);
  const result = readAnimationModel(first);
  assert.equal(result.clips[0].name, "Wave");
  assert.ok(Math.abs(result.clips[0].tracks[0].keys[1].frame - 15.5) < 1e-5);
  const other = { ...clip, name: "Other" };
  const second = writeAnimationClip(first, other);
  const updated = writeAnimationClip(second, { ...clip, durationFrames: 60 });
  assert.equal(readAnimationModel(updated).clips.length, 2);
  const { doc, bin } = decode(updated);
  assert.deepEqual([...bin.subarray(0, 4)], [7, 8, 9, 10]);
  for (const key of ["meshes", "materials", "skins", "extensions"]) assert.deepEqual(doc[key], document[key]);
  assert.deepEqual(doc.animations[1], decode(second).doc.animations[1]);
});
test("samples quaternions with slerp, STEP and degree conversion", () => {
  const track = { ...clip.tracks[0], keys: clip.tracks[0].keys.slice(0, 2) };
  assert.ok(Math.abs(quaternionToEuler(sampleAnimationTrack(track, 7.75))[2] - 45) < 1e-7);
  assert.deepEqual(sampleAnimationTrack({ ...track, interpolation: "STEP" }, 10), [0, 0, 0, 1]);
});
test("retargets renamed bones with real doubled translation delta", () => {
  const target = bones.map((b) => ({ ...b, name: `New${b.name}`, parent: b.parent && `New${b.parent}`, translation: b.translation.map((v) => v * 2) }));
  const movement = { ...clip, tracks: [{ bone: "Hips", path: "translation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 1, 0] }, { frame: 30, value: [1, 1.5, 0] }] }] };
  const result = retargetAnimationClip(movement, target, { Hips: "NewHips", Head: "NewHead" });
  assert.deepEqual(result.tracks[0].keys[1].value, [2, 3, 0]);
  assert.throws(() => retargetAnimationClip(movement, target, { Hips: "NewHips" }), /invalidMapping/);
  assert.throws(() => retargetAnimationClip(movement, target, { Hips: "NewHips", Head: "NewHips" }), /invalidMapping/);
  assert.throws(() => retargetAnimationClip(movement, [{ ...target[0], rotation: eulerToQuaternion([0, 90, 0]) }, target[1]], { Hips: "NewHips", Head: "NewHead" }), /incompatibleRig/);
});
test("rejects unsupported rig data and interpolation", () => {
  assert.throws(() => readAnimationModel(glb({ ...document, skins: [] })), /unsupportedGlb/);
  assert.throws(() => readAnimationModel(glb({ ...document, nodes: [{ ...document.nodes[0], matrix: Array(16).fill(0) }, document.nodes[1]] })), /unsupportedGlb/);
  assert.throws(() => writeAnimationClip(glb(document), { ...clip, tracks: [{ ...clip.tracks[0], interpolation: "CUBICSPLINE" }] }), /unsupportedInterpolation/);
  assert.throws(() => createAnimationPreset("walk", bones), /unsupportedPreset/);
});
const humanoid = [bone("Hips", null, [0, 1, 0]), ...["Spine", "Chest", "Neck", "Head"].map((name, i) => bone(name, ["Hips", "Spine", "Chest", "Neck"][i], [0, 0.2, 0])), ...["Left", "Right"].flatMap((side, index) => [bone(`${side}Shoulder`, "Chest", [index ? -0.2 : 0.2, 0, 0]), ...["UpperArm", "ForeArm", "Hand"].map((name, i) => bone(`${side}${name}`, `${side}${["Shoulder", "UpperArm", "ForeArm"][i]}`, [index ? -0.2 : 0.2, 0, 0])), ...["UpperLeg", "LowerLeg", "Foot"].map((name, i) => bone(`${side}${name}`, i ? `${side}${["UpperLeg", "LowerLeg"][i - 1]}` : "Hips", [0, -0.3, 0]))])];
test("creates moving idle, walk and run presets and lowers T-pose arms", () => {
  for (const kind of ["idle", "walk", "run"]) {
    const result = createAnimationPreset(kind, humanoid);
    assert.ok(result.tracks.length > 3);
    assert.ok(result.tracks.some((track) => JSON.stringify(track.keys[0].value) !== JSON.stringify(track.keys[1].value)));
    const arm = result.tracks.find((track) => track.bone === "LeftUpperArm");
    assert.ok(Math.abs(quaternionToEuler(arm.keys[0].value)[2]) > 40);
    assert.doesNotThrow(() => writeAnimationClip(glb({ ...document, nodes: humanoid.map((b) => ({ name: b.name, translation: b.translation, children: humanoid.flatMap((child, i) => child.parent === b.name ? [i] : []) })), skins: [{ joints: humanoid.map((_, i) => i) }] }), result));
  }
});

test("a saved clip deforms a real Three skinned mesh through GLTFLoader", async () => {
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { AnimationMixer, Matrix4, Vector3 } = await import("three");
  const parts = [];
  const views = [];
  const accessors = [];
  let length = 0;
  function append(array, type, componentType, count, extra = {}) {
    const data = new Uint8Array(array.buffer);
    views.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    accessors.push({ bufferView: views.length - 1, componentType, count, type, ...extra });
    parts.push(data); length += data.length;
    return accessors.length - 1;
  }
  const position = append(new Float32Array([1, 2, 0, 0, 2, 0, 1, 3, 0]), "VEC3", 5126, 3, { min: [0, 2, 0], max: [1, 3, 0] });
  const joints = append(new Uint16Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), "VEC4", 5123, 3);
  const weights = append(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), "VEC4", 5126, 3);
  const inverse = append(new Float32Array([...new Matrix4().makeTranslation(0, -1, 0).elements, ...new Matrix4().makeTranslation(0, -2, 0).elements]), "MAT4", 5126, 2);
  const binary = new Uint8Array(length); let offset = 0;
  for (const part of parts) { binary.set(part, offset); offset += part.length; }
  const doc = { ...document, scene: 0, scenes: [{ nodes: [0, 2] }], nodes: [...document.nodes, { mesh: 0, skin: 0 }], buffers: [{ byteLength: length }], bufferViews: views, accessors, skins: [{ joints: [0, 1], inverseBindMatrices: inverse }], meshes: [{ primitives: [{ attributes: { POSITION: position, JOINTS_0: joints, WEIGHTS_0: weights } }] }] };
  const output = writeAnimationClip(glb(doc, binary), clip);
  const parsed = await new GLTFLoader().parseAsync(output.buffer, "");
  let mesh;
  parsed.scene.traverse((object) => { if (object.isSkinnedMesh) mesh = object; });
  assert.ok(mesh);
  const mixer = new AnimationMixer(parsed.scene);
  mixer.clipAction(parsed.animations[0]).play(); mixer.setTime(15.5 / 30);
  parsed.scene.updateMatrixWorld(true);
  const point = mesh.applyBoneTransform(0, new Vector3(1, 2, 0));
  assert.ok(point.distanceTo(new Vector3(0, 3, 0)) < 1e-5, point.toArray().join(","));
});

test("rejects malformed cubic samplers, unknown joints, invalid quaternions and transformed nonjoint frames", () => {
  const written = writeAnimationClip(glb(document), clip);
  const { doc, bin } = decode(written);
  doc.animations[0].samplers[0].interpolation = "CUBICSPLINE";
  assert.throws(() => readAnimationModel(glb(doc, bin)), /invalidGlb/);
  assert.throws(() => writeAnimationClip(glb(document), { ...clip, tracks: [{ ...clip.tracks[0], keys: [{ frame: 0, value: [0, 0, 0, 2] }] }] }), /invalidClip/);
  assert.throws(() => writeAnimationClip(glb(document), { ...clip, bones: bones.map((b) => ({ ...b, name: b.name === "Head" ? "Missing" : b.name })) }), /invalidClip|incompatibleRig/);
  const shifted = { ...document, nodes: [...document.nodes, { translation: [1, 0, 0], children: [0] }] };
  assert.throws(() => readAnimationModel(glb(shifted)), /incompatibleRig/);
});

test("resamples cubic GLB channels using Hermite tangents in seconds", () => {
  const doc = structuredClone(document);
  const data = new Float32Array([0, 1, ...[0, 0, 0], ...[0, 1, 0], ...[0, 4, 0], ...[0, -2, 0], ...[2, 1, 0], ...[0, 0, 0]]);
  doc.buffers = [{ byteLength: data.byteLength }];
  doc.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 8 }, { buffer: 0, byteOffset: 8, byteLength: 72 }];
  doc.accessors = [{ bufferView: 0, componentType: 5126, count: 2, type: "SCALAR" }, { bufferView: 1, componentType: 5126, count: 6, type: "VEC3" }];
  doc.animations = [{ name: "Cubic", samplers: [{ input: 0, output: 1, interpolation: "CUBICSPLINE" }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] }];
  const result = readAnimationModel(glb(doc, new Uint8Array(data.buffer))).clips[0];
  assert.equal(result.tracks[0].interpolation, "LINEAR");
  assert.deepEqual(result.tracks[0].keys.find((k) => k.frame === 15).value, [1, 1.75, 0]);
});

test("lowers Blender bone frames in world Y rather than rotating arms in depth", async () => {
  const { Matrix4, Quaternion, Vector3 } = await import("three");
  const blenderBones = humanoid.map((b) => ({ ...b, rotation: b.name === "LeftShoulder" ? [-.5, -.5, -.5, .5] : b.rotation, translation: b.name === "LeftUpperArm" || b.name === "LeftForeArm" ? [0, .3, 0] : b.translation }));
  const result = createAnimationPreset("idle", blenderBones);
  const world = new Map();
  const matrix = (name) => {
    if (world.has(name)) return world.get(name);
    const b = blenderBones.find((item) => item.name === name);
    const track = result.tracks.find((item) => item.bone === name && item.path === "rotation");
    const local = new Matrix4().compose(new Vector3(...b.translation), new Quaternion(...(track ? sampleAnimationTrack(track, 0) : b.rotation)), new Vector3(...b.scale));
    const value = b.parent ? matrix(b.parent).clone().multiply(local) : local;
    world.set(name, value); return value;
  };
  const upper = new Vector3().setFromMatrixPosition(matrix("LeftUpperArm"));
  const elbow = new Vector3().setFromMatrixPosition(matrix("LeftForeArm"));
  assert.ok(elbow.y < upper.y - .2, `${upper.toArray()} -> ${elbow.toArray()}`);
});

test("preserves the real Blender Wave while adding presets and matches cubic samples", { skip: !process.env.FORMA_ANIMATION_FIXTURE }, async () => {
  const { readFile } = await import("node:fs/promises");
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const { Quaternion, Vector3 } = await import("three");
  const bytes = new Uint8Array(await readFile(process.env.FORMA_ANIMATION_FIXTURE));
  const original = decode(bytes);
  const model = readAnimationModel(bytes);
  const wave = model.clips.find((item) => item.name === "Wave");
  assert.ok(wave);
  const parsed = await new GLTFLoader().parseAsync(bytes.buffer, "");
  const originalTrack = parsed.animations.find((item) => item.name === "Wave").tracks.find((item) => item.name.includes("LeftUpperArm"));
  const interpolant = originalTrack.createInterpolant();
  const editable = wave.tracks.find((item) => item.bone === "LeftUpperArm");
  for (const key of editable.keys) {
    const expected = new Quaternion(...interpolant.evaluate(key.frame / wave.fps));
    assert.ok(1 - Math.abs(expected.dot(new Quaternion(...key.value))) < 1e-6);
  }
  for (const kind of ["idle", "walk", "run"]) {
    const preset = createAnimationPreset(kind, model.bones);
    const output = writeAnimationClip(bytes, preset);
    const saved = decode(output);
    assert.deepEqual(saved.doc.animations[0], original.doc.animations[0]);
    assert.deepEqual(saved.bin.subarray(0, original.bin.length), original.bin);
    const loaded = await new GLTFLoader().parseAsync(output.buffer, "");
    const { AnimationMixer } = await import("three");
    const mixer = new AnimationMixer(loaded.scene);
    mixer.clipAction(loaded.animations.find((item) => item.name === kind)).play(); mixer.setTime(.1);
    loaded.scene.updateMatrixWorld(true);
    const shoulder = loaded.scene.getObjectByName("LeftUpperArm");
    const elbow = loaded.scene.getObjectByName("LeftForeArm");
    assert.ok(elbow.getWorldPosition(new Vector3()).y < shoulder.getWorldPosition(new Vector3()).y - .15);
  }
});
