import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { AnimationBone, AnimationClipData, AnimationTrack } from "../../../electron/contract";

type Triple = [number, number, number];
type Quat = [number, number, number, number];
type GltfNode = { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[]; extensions?: unknown };
type GltfAccessor = { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown; normalized?: boolean };
type GltfAnimation = { name?: string; extras?: { forma?: { fps?: number; durationFrames?: number } }; channels: { sampler: number; target: { node?: number; path: string }; extensions?: unknown }[]; samplers: { input: number; output: number; interpolation?: string }[] };
type Gltf = { asset: { version: string }; nodes: GltfNode[]; skins: { joints: number[] }[]; buffers?: { byteLength: number; uri?: string }[]; bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]; accessors?: GltfAccessor[]; animations?: GltfAnimation[]; meshes?: { primitives: { targets?: unknown }[] }[]; images?: { uri?: string }[]; extensionsRequired?: string[] };
const fail = (key: string): never => { throw new Error(`animation.${key}`); };
const close = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
const finite = (v: number[], size: number) => Array.isArray(v) && v.length === size && v.every((n) => Number.isFinite(n) && Math.abs(n) <= 10000);
const unit = (q: number[]) => finite(q, 4) && Math.abs(Math.hypot(...q) - 1) < 1e-3;
const copyBones = (bones: AnimationBone[]) => structuredClone(bones);

function parse(bytes: Uint8Array): { doc: Gltf; bin: Uint8Array } {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) return fail("invalidGlb");
    let offset = 12;
    let doc: Gltf | undefined;
    let bin = new Uint8Array();
    while (offset < bytes.length) {
      const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true);
      if (length % 4 || offset + 8 + length > bytes.length) return fail("invalidGlb");
      const chunk = bytes.subarray(offset + 8, offset + 8 + length);
      if (type === 0x4e4f534a && !doc && offset === 12) doc = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004e4942 && !bin.length) bin = new Uint8Array(chunk);
      else return fail("unsupportedGlb");
      offset += 8 + length;
    }
    if (!doc || doc.asset?.version !== "2.0") return fail("invalidGlb");
    if (doc.buffers?.some((b, i) => i !== 0 || b.uri || b.byteLength > bin.length) || doc.images?.some((i) => i.uri) || doc.extensionsRequired?.length || doc.meshes?.some((m) => m.primitives.some((p) => p.targets))) return fail("unsupportedGlb");
    return { doc, bin };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("animation.")) throw error;
    return fail("invalidGlb");
  }
}

function skeleton(doc: Gltf): { bones: AnimationBone[]; joints: number[] } {
  if (!Array.isArray(doc.skins) || doc.skins.length !== 1 || !Array.isArray(doc.nodes)) return fail("unsupportedGlb");
  const joints = doc.skins[0].joints;
  if (!joints?.length || joints.length > 256 || new Set(joints).size !== joints.length) return fail("unsupportedGlb");
  const parents = new Map<number, number>();
  doc.nodes.forEach((node, i) => node.children?.forEach((child) => {
    if (!doc.nodes[child] || parents.has(child) || child === i) return fail("invalidGlb");
    parents.set(child, i);
  }));
  const names = new Set<string>();
  const bones = joints.map((index): AnimationBone => {
    const node = doc.nodes[index];
    if (!node || !node.name || names.has(node.name) || node.matrix || node.extensions) return fail("unsupportedGlb");
    names.add(node.name);
    const visited = new Set([index]);
    let parent = parents.get(index);
    while (parent !== undefined) {
      if (visited.has(parent)) return fail("invalidGlb");
      visited.add(parent);
      if (joints.includes(parent)) break;
      const ancestor = doc.nodes[parent];
      if (ancestor.matrix || !close(ancestor.translation ?? [0, 0, 0], [0, 0, 0]) || !close(ancestor.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1]) || !close(ancestor.scale ?? [1, 1, 1], [1, 1, 1])) return fail("incompatibleRig");
      parent = parents.get(parent);
    }
    return { name: node.name, parent: parent === undefined ? null : doc.nodes[parent].name!, translation: (node.translation ?? [0, 0, 0]) as Triple, rotation: (node.rotation ?? [0, 0, 0, 1]) as Quat, scale: (node.scale ?? [1, 1, 1]) as Triple };
  });
  validateBones(bones);
  return { bones, joints };
}

function validateBones(bones: AnimationBone[]) {
  if (!bones.length || bones.length > 256 || new Set(bones.map((b) => b.name)).size !== bones.length) fail("invalidClip");
  const byName = new Map(bones.map((b) => [b.name, b]));
  bones.forEach((b) => {
    if (!b.name || b.name.length > 120 || !finite(b.translation, 3) || !unit(b.rotation) || !finite(b.scale, 3) || b.scale.some((v) => v <= 0)) fail("invalidClip");
    const seen = new Set([b.name]);
    let parent = b.parent;
    while (parent !== null) {
      if (!byName.has(parent) || seen.has(parent)) fail("invalidClip");
      seen.add(parent); parent = byName.get(parent)!.parent;
    }
  });
}
function validateClip(clip: AnimationClipData) {
  validateBones(clip.bones);
  if (clip.version !== 1 || !clip.name.trim() || clip.name.length > 120 || !Number.isInteger(clip.fps) || clip.fps < 1 || clip.fps > 120 || !Number.isInteger(clip.durationFrames) || clip.durationFrames < 1 || clip.durationFrames > 72000 || !clip.tracks.length || clip.tracks.length > 768) fail("invalidClip");
  const seen = new Set<string>();
  clip.tracks.forEach((track) => {
    const id = `${track.bone}:${track.path}`;
    if (seen.has(id) || !clip.bones.some((b) => b.name === track.bone) || !["translation", "rotation", "scale"].includes(track.path) || !track.keys.length || track.keys.length > 10000) fail("invalidClip");
    seen.add(id);
    if (!["LINEAR", "STEP"].includes(track.interpolation)) fail("unsupportedInterpolation");
    track.keys.forEach((key, i) => {
      if (!Number.isFinite(key.frame) || key.frame < 0 || key.frame > clip.durationFrames + 1e-4 || (i > 0 && key.frame <= track.keys[i - 1].frame) || !finite(key.value, track.path === "rotation" ? 4 : 3) || (track.path === "rotation" && !unit(key.value)) || (track.path === "scale" && key.value.some((v) => v <= 0))) fail("invalidClip");
    });
  });
}
export function validateAnimationClip(value: unknown): AnimationClipData {
  try {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 4 * 1024 * 1024) return fail("invalidClip");
    const clip = value as AnimationClipData;
    validateClip(clip);
    return structuredClone(clip);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("animation.")) throw error;
    return fail("invalidClip");
  }
}
function accessorValues(doc: Gltf, bin: Uint8Array, index: number, size: number): number[][] {
  const accessor = doc.accessors?.[index];
  if (!accessor || accessor.componentType !== 5126 || accessor.type !== (size === 1 ? "SCALAR" : `VEC${size}`) || accessor.sparse || accessor.normalized || !Number.isInteger(accessor.count) || accessor.count < 1 || accessor.count > 100000) return fail("unsupportedGlb");
  const buffer = doc.bufferViews?.[accessor.bufferView ?? -1];
  if (!buffer || buffer.buffer !== 0) return fail("invalidGlb");
  const stride = buffer.byteStride ?? size * 4;
  const start = (buffer.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  if (stride < size * 4 || start < 0 || start + (accessor.count - 1) * stride + size * 4 > bin.length || (accessor.byteOffset ?? 0) + (accessor.count - 1) * stride + size * 4 > buffer.byteLength) return fail("invalidGlb");
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  return Array.from({ length: accessor.count }, (_, i) => Array.from({ length: size }, (_, j) => view.getFloat32(start + i * stride + j * 4, true)));
}

export function readAnimationModel(bytes: Uint8Array): { bones: AnimationBone[]; clips: AnimationClipData[] } {
  const { doc, bin } = parse(bytes);
  const { bones, joints } = skeleton(doc);
  const clips = (doc.animations ?? []).map((animation, index): AnimationClipData => {
    const fps = animation.extras?.forma?.fps ?? 30;
    if (!Number.isInteger(fps) || fps < 1 || fps > 120) return fail("invalidClip");
    const tracks = animation.channels.map((channel): AnimationTrack => {
      const boneIndex = joints.indexOf(channel.target.node ?? -1);
      if (boneIndex < 0 || !["translation", "rotation", "scale"].includes(channel.target.path) || channel.extensions) return fail("unsupportedGlb");
      const sampler = animation.samplers[channel.sampler];
      if (!sampler) return fail("invalidGlb");
      const interpolation = sampler.interpolation ?? "LINEAR";
      if (interpolation !== "LINEAR" && interpolation !== "STEP" && interpolation !== "CUBICSPLINE") return fail("unsupportedInterpolation");
      const path = channel.target.path as AnimationTrack["path"];
      const times = accessorValues(doc, bin, sampler.input, 1), values = accessorValues(doc, bin, sampler.output, path === "rotation" ? 4 : 3);
      if (interpolation === "CUBICSPLINE") {
        if (values.length !== times.length * 3 || times.some(([time], i) => !Number.isFinite(time) || time < 0 || time * fps > 72000 || (i > 0 && time <= times[i - 1][0])) || values.some((row) => row.some((v) => !Number.isFinite(v)))) return fail("invalidGlb");
        const first = times[0][0] * fps, last = times[times.length - 1][0] * fps;
        const frames = [...new Set([first, last, ...times.map(([t]) => t * fps), ...Array.from({ length: Math.max(0, Math.floor(last) - Math.ceil(first) + 1) }, (_, i) => Math.ceil(first) + i)])].sort((a, b) => a - b);
        const keys = frames.map((frame) => {
          const time = frame / fps;
          let segment = times.findIndex(([t]) => t > time) - 1;
          let value: number[];
          if (time <= times[0][0]) value = [...values[1]];
          else if (time >= times[times.length - 1][0]) value = [...values[values.length - 2]];
          else {
            if (segment < 0) segment = times.length - 2;
            const dt = times[segment + 1][0] - times[segment][0], t = (time - times[segment][0]) / dt;
            const t2 = t * t, t3 = t2 * t;
            value = values[segment * 3 + 1].map((v, j) => (2 * t3 - 3 * t2 + 1) * v + (t3 - 2 * t2 + t) * dt * values[segment * 3 + 2][j] + (-2 * t3 + 3 * t2) * values[(segment + 1) * 3 + 1][j] + (t3 - t2) * dt * values[(segment + 1) * 3][j]);
          }
          if (path === "rotation") {
            if (Math.hypot(...value) < 1e-10) return fail("invalidGlb");
            value = new Quaternion(...value as Quat).normalize().toArray();
          }
          return { frame, value };
        });
        return { bone: bones[boneIndex].name, path, interpolation: "LINEAR", keys };
      }
      if (times.length !== values.length) return fail("invalidGlb");
      return { bone: bones[boneIndex].name, path, interpolation, keys: times.map(([time], i) => ({ frame: time * fps, value: values[i] })) };
    });
    const maximum = Math.max(0, ...tracks.flatMap((t) => t.keys.map((k) => k.frame)));
    const stored = animation.extras?.forma?.durationFrames;
    const durationFrames = stored === undefined ? Math.max(1, Math.ceil(maximum - 1e-5)) : stored;
    tracks.forEach((track) => track.keys.forEach((key) => { if (key.frame > durationFrames && key.frame - durationFrames < 1e-4) key.frame = durationFrames; }));
    const clip: AnimationClipData = { version: 1, name: animation.name || `Animation ${index + 1}`, fps, durationFrames, bones: copyBones(bones), tracks };
    validateClip(clip);
    return clip;
  });
  return { bones, clips };
}

export function writeAnimationClip(bytes: Uint8Array, clip: AnimationClipData): Uint8Array {
  validateClip(clip);
  const { doc, bin } = parse(bytes);
  const { bones, joints } = skeleton(doc);
  if (clip.bones.length !== bones.length || clip.bones.some((b) => {
    const target = bones.find((v) => v.name === b.name);
    return !target || target.parent !== b.parent || !close(target.translation, b.translation) || !close(target.rotation, b.rotation) || !close(target.scale, b.scale);
  })) return fail("incompatibleRig");
  doc.accessors ??= []; doc.bufferViews ??= []; doc.animations ??= [];
  const chunks: Uint8Array[] = [bin];
  let length = bin.length;
  const append = (values: number[][], size: number): number => {
    const data = new Uint8Array(values.length * size * 4);
    const view = new DataView(data.buffer);
    values.forEach((row, i) => row.forEach((v, j) => view.setFloat32((i * size + j) * 4, v, true)));
    const bufferView = doc.bufferViews!.length;
    doc.bufferViews!.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    const accessor = doc.accessors!.length;
    const value: GltfAccessor & { min?: number[]; max?: number[] } = { bufferView, componentType: 5126, count: values.length, type: size === 1 ? "SCALAR" : `VEC${size}` };
    if (size === 1) { value.min = [values[0][0]]; value.max = [values[values.length - 1][0]]; }
    doc.accessors!.push(value); chunks.push(data); length += data.length;
    return accessor;
  };
  const animation: GltfAnimation = { name: clip.name, extras: { forma: { fps: clip.fps, durationFrames: clip.durationFrames } }, channels: [], samplers: [] };
  clip.tracks.forEach((track, i) => {
    animation.samplers.push({ input: append(track.keys.map((k) => [k.frame / clip.fps]), 1), output: append(track.keys.map((k) => k.value), track.path === "rotation" ? 4 : 3), interpolation: track.interpolation });
    animation.channels.push({ sampler: i, target: { node: joints[bones.findIndex((b) => b.name === track.bone)], path: track.path } });
  });
  const previous = doc.animations.findIndex((a) => a.name === clip.name);
  if (previous < 0) doc.animations.push(animation); else doc.animations[previous] = animation;
  doc.buffers = [{ byteLength: length }];
  const json = new TextEncoder().encode(JSON.stringify(doc));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const result = new Uint8Array(28 + jsonLength + length);
  const view = new DataView(result.buffer);
  [0x46546c67, 2, result.length, jsonLength, 0x4e4f534a].forEach((v, i) => view.setUint32(i * 4, v, true));
  result.fill(32, 20, 20 + jsonLength); result.set(json, 20);
  view.setUint32(20 + jsonLength, length, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  let offset = 28 + jsonLength;
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.length; });
  return result;
}

export function eulerToQuaternion(angles: Triple): Quat {
  return new Quaternion().setFromEuler(new Euler(...angles.map((v) => v * Math.PI / 180) as Triple, "XYZ")).toArray();
}
export function quaternionToEuler(rotation: number[]): Triple {
  const euler = new Euler().setFromQuaternion(new Quaternion(...rotation as Quat), "XYZ");
  return [euler.x, euler.y, euler.z].map((v) => v * 180 / Math.PI) as Triple;
}
export function sampleAnimationTrack(track: AnimationTrack, frame: number): number[] {
  if (!track.keys.length || !Number.isFinite(frame)) return fail("invalidClip");
  const first = track.keys[0], last = track.keys[track.keys.length - 1];
  if (frame <= first.frame) return [...first.value];
  if (frame >= last.frame) return [...last.value];
  const index = track.keys.findIndex((key) => key.frame > frame);
  const a = track.keys[index - 1], b = track.keys[index];
  if (track.interpolation === "STEP") return [...a.value];
  const alpha = (frame - a.frame) / (b.frame - a.frame);
  if (track.path === "rotation") return new Quaternion(...a.value as Quat).slerp(new Quaternion(...b.value as Quat), alpha).normalize().toArray();
  return a.value.map((v, i) => v + (b.value[i] - v) * alpha);
}

export function retargetAnimationClip(clip: AnimationClipData, targetBones: AnimationBone[], mapping: Record<string, string>): AnimationClipData {
  validateClip(clip); validateBones(targetBones);
  const targets = new Map(targetBones.map((b) => [b.name, b]));
  const assigned = clip.bones.map((b) => mapping[b.name]);
  if (assigned.some((name) => !name || !targets.has(name)) || new Set(assigned).size !== assigned.length) return fail("invalidMapping");
  clip.bones.forEach((source) => {
    const target = targets.get(mapping[source.name])!;
    const orientation = Math.abs(new Quaternion(...source.rotation).dot(new Quaternion(...target.rotation)));
    if (target.parent !== (source.parent ? mapping[source.parent] : null) || orientation < 1 - 1e-5 || !close(source.scale, target.scale)) fail("incompatibleRig");
  });
  const height = (bones: AnimationBone[]) => {
    const byName = new Map(bones.map((b) => [b.name, b]));
    const matrices = new Map<string, Matrix4>();
    const world = (name: string): Matrix4 => {
      const cached = matrices.get(name);
      if (cached) return cached;
      const bone = byName.get(name)!;
      const local = new Matrix4().compose(new Vector3(...bone.translation), new Quaternion(...bone.rotation), new Vector3(...bone.scale));
      const matrix = bone.parent ? world(bone.parent).clone().multiply(local) : local;
      matrices.set(name, matrix);
      return matrix;
    };
    const ys = bones.map((bone) => new Vector3().setFromMatrixPosition(world(bone.name)).y);
    return Math.max(...ys) - Math.min(...ys);
  };
  const sourceHeight = height(clip.bones), targetHeight = height(clip.bones.map((b) => targets.get(mapping[b.name])!));
  if (sourceHeight < 1e-6 || targetHeight < 1e-6) return fail("incompatibleRig");
  const ratio = targetHeight / sourceHeight;
  const tracks = clip.tracks.map((track): AnimationTrack => {
    const source = clip.bones.find((b) => b.name === track.bone)!, target = targets.get(mapping[track.bone])!;
    return { ...track, bone: target.name, keys: track.keys.map((key) => {
      let value: number[];
      if (track.path === "translation") value = key.value.map((v, i) => target.translation[i] + (v - source.translation[i]) * ratio);
      else if (track.path === "scale") value = key.value.map((v, i) => target.scale[i] * v / source.scale[i]);
      else value = new Quaternion(...target.rotation).multiply(new Quaternion(...source.rotation).invert()).multiply(new Quaternion(...key.value as Quat)).normalize().toArray();
      return { frame: key.frame, value };
    }) };
  });
  return { ...clip, bones: copyBones(targetBones), tracks };
}

export function createAnimationPreset(kind: "idle" | "walk" | "run", bones: AnimationBone[], fps = 30): AnimationClipData {
  validateBones(bones);
  if (!["idle", "walk", "run"].includes(kind)) return fail("unsupportedPreset");
  const required = ["Hips", "Spine", "Chest", "Neck", "Head", ...["Left", "Right"].flatMap((side) => ["Shoulder", "UpperArm", "ForeArm", "Hand", "UpperLeg", "LowerLeg", "Foot"].map((part) => `${side}${part}`))];
  const byName = new Map(bones.map((b) => [b.name, b]));
  if (required.some((name) => !byName.has(name))) return fail("unsupportedPreset");
  const durationFrames = Math.round(fps * (kind === "idle" ? 3 : kind === "walk" ? 1 : 0.65));
  const restWorld = new Map<string, Quaternion>();
  const restRotation = (name: string): Quaternion => {
    const cached = restWorld.get(name);
    if (cached) return cached;
    const bone = byName.get(name)!;
    const rotation = bone.parent ? restRotation(bone.parent).clone().multiply(new Quaternion(...bone.rotation)) : new Quaternion(...bone.rotation);
    restWorld.set(name, rotation);
    return rotation;
  };
  const steps = 24;
  const moving = kind !== "idle", run = kind === "run";
  const animatedNames = ["Spine", "Chest", ...["Left", "Right"].flatMap((side) => ["UpperArm", "ForeArm", ...(moving ? ["UpperLeg", "LowerLeg", "Foot"] : [])].map((part) => `${side}${part}`))];
  const tracks: AnimationTrack[] = animatedNames.map((name) => ({ bone: name, path: "rotation", interpolation: "LINEAR", keys: [] }));
  const angles = (x = 0, y = 0, z = 0) => new Quaternion(...eulerToQuaternion([x, y, z]));
  for (let i = 0; i <= steps; i++) {
    const phase = i / steps * Math.PI * 2;
    const deltas = new Map<string, Quaternion>();
    const spine = angles(run ? 12 : moving ? 4 : Math.sin(phase));
    const chest = spine.clone().multiply(angles(Math.sin(phase) * (moving ? 3 : 1.5), moving ? Math.sin(phase) * 4 : 0));
    deltas.set("Spine", spine); deltas.set("Chest", chest);
    for (const [index, side] of ["Left", "Right"].entries()) {
      const direction = index ? -1 : 1;
      const swing = moving ? -direction * Math.sin(phase) * (run ? 48 : 28) : Math.sin(phase);
      const bend = moving ? -(run ? 65 : 15) - Math.max(0, direction * Math.sin(phase)) * 20 : -8;
      deltas.set(`${side}UpperArm`, chest.clone().multiply(angles(swing)).multiply(angles(0, 0, -direction * 70)));
      deltas.set(`${side}ForeArm`, chest.clone().multiply(angles(swing + bend)).multiply(angles(0, 0, -direction * 70)));
      if (moving) {
        const stride = direction * Math.sin(phase) * (run ? 48 : 26);
        const knee = Math.max(0, -direction * Math.sin(phase)) * (run ? 85 : 45);
        const ankle = -direction * Math.sin(phase) * (run ? 20 : 12);
        deltas.set(`${side}UpperLeg`, angles(stride));
        deltas.set(`${side}LowerLeg`, angles(stride + knee));
        deltas.set(`${side}Foot`, angles(stride + knee + ankle));
      }
    }
    const delta = (name: string | null): Quaternion => {
      if (!name) return new Quaternion();
      return deltas.get(name) ?? delta(byName.get(name)!.parent);
    };
    tracks.forEach((track) => {
      const bone = byName.get(track.bone)!;
      const parentWorld = bone.parent ? delta(bone.parent).clone().multiply(restRotation(bone.parent)) : new Quaternion();
      const world = delta(bone.name).clone().multiply(restRotation(bone.name));
      track.keys.push({ frame: i * durationFrames / steps, value: parentWorld.invert().multiply(world).normalize().toArray() });
    });
  }
  const hips = byName.get("Hips")!;
  const amplitude = Math.max(Math.abs(hips.translation[1]), 0.1) * (run ? 0.06 : moving ? 0.025 : 0.006);
  tracks.push({ bone: "Hips", path: "translation", interpolation: "LINEAR", keys: Array.from({ length: steps + 1 }, (_, i) => ({ frame: i * durationFrames / steps, value: [hips.translation[0], hips.translation[1] + Math.sin(i / steps * Math.PI * (moving ? 4 : 2)) * amplitude, hips.translation[2]] })) });
  const clip: AnimationClipData = { version: 1, name: kind, fps, durationFrames, bones: copyBones(bones), tracks };
  validateClip(clip); return clip;
}
