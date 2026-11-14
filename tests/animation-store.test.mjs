import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { useProjectStore } from "../src/stores/project-store.ts";
import { readAnimationModel, writeAnimationClip } from "../src/feature/animation/operations.ts";

const source = await readFile(new URL("../src/feature/animation/store.ts", import.meta.url), "utf8");
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let harnessId = 0;

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function rigBytes(canonical = false) {
  const definitions = canonical ? [["Hips", null, [0, 1, 0]], ["Spine", "Hips", [0, .2, 0]], ["Chest", "Spine", [0, .2, 0]], ["Neck", "Chest", [0, .15, 0]], ["Head", "Neck", [0, .15, 0]], ...["Left", "Right"].flatMap((side, index) => {
    const x = index === 0 ? 1 : -1;
    return [[`${side}Shoulder`, "Chest", [x * .1, 0, 0]], [`${side}UpperArm`, `${side}Shoulder`, [x * .2, 0, 0]], [`${side}ForeArm`, `${side}UpperArm`, [x * .3, 0, 0]], [`${side}Hand`, `${side}ForeArm`, [x * .3, 0, 0]], [`${side}UpperLeg`, "Hips", [x * .1, -.1, 0]], [`${side}LowerLeg`, `${side}UpperLeg`, [0, -.4, 0]], [`${side}Foot`, `${side}LowerLeg`, [0, -.4, 0]]];
  })] : [["Hips", null, [0, 1, 0]], ["Head", "Hips", [0, 1, 0]]];
  const nodes = definitions.map(([name, , translation]) => ({ name, translation }));
  definitions.forEach(([, parent], index) => {
    if (parent) { const node = nodes[definitions.findIndex(([name]) => name === parent)]; (node.children ??= []).push(index); }
  });
  const document = { asset: { version: "2.0" }, nodes, skins: [{ joints: nodes.map((_, index) => index) }], buffers: [{ byteLength: 4 }] };
  const json = new TextEncoder().encode(JSON.stringify(document));
  const length = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(32 + length);
  const view = new DataView(bytes.buffer);
  [0x46546c67, 2, bytes.length, length, 0x4e4f534a].forEach((value, index) => view.setUint32(index * 4, value, true));
  bytes.fill(32, 20, 20 + length); bytes.set(json, 20);
  view.setUint32(20 + length, 4, true); view.setUint32(24 + length, 0x004e4942, true);
  return bytes;
}

function clip(name = "Library clip", bones = readAnimationModel(rigBytes()).bones) {
  return { version: 1, name, fps: 30, durationFrames: 30, bones, tracks: [{ bone: "Head", path: "rotation", interpolation: "LINEAR", keys: [{ frame: 0, value: [0, 0, 0, 1] }, { frame: 30, value: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }] }] };
}

async function harness(canonical = false) {
  useProjectStore.getState().newProject();
  const model = { type: "staged", stagingId: crypto.randomUUID(), name: "Source.glb" };
  useProjectStore.getState().addVariant({ label: "Source", origin: "import", engineId: null, model, lods: [], params: {} }, true);
  const variantId = useProjectStore.getState().activeVariantId;
  const calls = { reads: [], libraryReads: [], librarySaves: [], staged: [] };
  const bytes = rigBytes(canonical);
  const handlers = {
    read: async () => clip(),
    save: async () => ({ id: "saved-library-id", name: "Library clip" }),
    model: async () => writeAnimationClip(bytes, clip("Source clip", readAnimationModel(bytes).bones)),
    stage: async () => ({ type: "staged", stagingId: crypto.randomUUID(), name: "Animated.glb" }),
  };
  globalThis.window = { forma: {
    models: {
      read: async (input) => { calls.reads.push(input); return handlers.model(input); },
      stageBytes: async (bytes, name) => { calls.staged.push({ bytes, name }); return handlers.stage(bytes, name); },
    },
    animations: {
      read: async (id) => { calls.libraryReads.push(id); return handlers.read(id); },
      save: async (id, data) => { calls.librarySaves.push({ id, data }); return handlers.save(id, data); },
      list: async () => [],
    },
  } };
  let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  compiled = compiled
    .replace('from "zustand"', `from "${import.meta.resolve("zustand")}"`)
    .replace('from "@/lib/i18n"', `from "${dataUrl('export default { t: value => value };')}"`)
    .replace('from "@/stores/project-store"', `from "${new URL("../src/stores/project-store.ts", import.meta.url).href}"`)
    .replace('from "@/feature/jobs"', `from "${dataUrl("export async function enqueueVideoMotion() {}")}"`)
    .replace('from "./operations"', `from "${new URL("../src/feature/animation/operations.ts", import.meta.url).href}"`);
  const animation = await import(dataUrl(`${compiled}\nexport const harnessVersion = ${++harnessId};`));
  await animation.loadAnimationSource();
  assert.equal(animation.useAnimationStore.getState().draft?.name, "Source clip");
  return { animation, calls, handlers, variantId, model };
}

test("animation source requests the exact staged model and retains its variant", async () => {
  const { animation, calls, variantId, model } = await harness();
  assert.deepEqual(calls.reads, [{ type: "staged", stagingId: model.stagingId }]);
  assert.equal(animation.useAnimationStore.getState().source.variantId, variantId);
  assert.deepEqual(useProjectStore.getState().retainedVariantIds, [variantId]);
});

test("loading a saved model uses project and asset IDs and releases the old source", async () => {
  const { animation, calls, variantId } = await harness();
  const projectId = crypto.randomUUID(), assetId = crypto.randomUUID();
  useProjectStore.setState({ id: projectId });
  useProjectStore.getState().addVariant({ label: "Saved source", origin: "import", engineId: null, model: { type: "asset", assetId, name: "Saved.glb" }, lods: [], params: {} }, true);
  const targetId = useProjectStore.getState().activeVariantId;
  await animation.loadAnimationSource();
  assert.deepEqual(calls.reads.at(-1), { type: "asset", projectId, assetId });
  assert.equal(animation.useAnimationStore.getState().source.variantId, targetId);
  assert.deepEqual(useProjectStore.getState().retainedVariantIds, [targetId]);
  assert.notEqual(targetId, variantId);
});

for (const action of ["loadLibraryAnimation", "retargetLibraryAnimation"]) {
  test(`${action} blocks key edits and preset creation during its read`, async () => {
    const { animation, handlers, calls } = await harness();
    const gate = deferred(); handlers.read = () => gate.promise;
    const before = structuredClone(animation.useAnimationStore.getState().draft);
    const pending = animation[action]("library-item", { Hips: "Hips", Head: "Head" });
    assert.equal(animation.useAnimationStore.getState().busy, true);
    animation.setAnimationName("Edit during library read");
    animation.setAnimationKey("Head", "rotation", 10, [0, 90, 0], "STEP");
    await animation.createPreset("idle");
    assert.deepEqual(animation.useAnimationStore.getState().draft, before);
    assert.equal(animation.useAnimationStore.getState().dirty, false);
    assert.equal(animation.useAnimationStore.getState().canUndo, false);
    gate.resolve(clip()); await pending;
    assert.deepEqual(calls.libraryReads, ["library-item"]);
    assert.equal(animation.useAnimationStore.getState().draft.name, "Library clip");
    assert.equal(animation.useAnimationStore.getState().dirty, true);
    assert.equal(animation.useAnimationStore.getState().busy, false);
  });

  for (const outcome of ["resolve", "reject"]) {
    test(`${action} ignores a stale ${outcome} after resetting the project`, async () => {
      const { animation, handlers } = await harness();
      const gate = deferred(); handlers.read = () => gate.promise;
      const pending = animation[action]("library-item", { Hips: "Hips", Head: "Head" });
      useProjectStore.getState().newProject(); animation.resetAnimationSession();
      const sessionId = useProjectStore.getState().sessionId;
      if (outcome === "resolve") gate.resolve(clip()); else gate.reject(new Error("Old request failed"));
      await pending;
      const state = animation.useAnimationStore.getState();
      assert.equal(state.source, null); assert.equal(state.draft, null); assert.equal(state.error, null);
      assert.equal(state.dirty, false); assert.equal(state.busy, false);
      assert.equal(useProjectStore.getState().sessionId, sessionId);
      assert.deepEqual(useProjectStore.getState().retainedVariantIds, []);
    });
  }
}

for (const outcome of ["resolve", "reject"]) {
  test(`library save ignores its old ID or error after a project reset (${outcome})`, async () => {
    const { animation, handlers, calls } = await harness();
    const gate = deferred(); handlers.save = () => gate.promise;
    const pending = animation.saveAnimationToLibrary();
    assert.equal(animation.useAnimationStore.getState().busy, true);
    animation.setAnimationName("Edit during library save");
    assert.equal(animation.useAnimationStore.getState().draft.name, "Source clip");
    assert.equal(calls.librarySaves[0].data.name, "Source clip");
    useProjectStore.getState().newProject(); animation.resetAnimationSession();
    if (outcome === "resolve") gate.resolve({ id: "old-library-id" }); else gate.reject(new Error("Old save failed"));
    await pending;
    assert.equal(animation.useAnimationStore.getState().libraryId, null);
    assert.equal(animation.useAnimationStore.getState().draft, null);
    assert.equal(animation.useAnimationStore.getState().error, null);
    assert.equal(animation.useAnimationStore.getState().busy, false);
  });
}

test("deferred model loading cannot bind its old source into another project", async () => {
  const { animation, handlers } = await harness();
  const gate = deferred(); handlers.model = () => gate.promise;
  const pending = animation.loadAnimationSource();
  useProjectStore.getState().newProject(); animation.resetAnimationSession();
  gate.resolve(writeAnimationClip(rigBytes(), clip("Old source"))); await pending;
  assert.equal(animation.useAnimationStore.getState().source, null);
  assert.equal(animation.useAnimationStore.getState().draft, null);
  assert.equal(animation.useAnimationStore.getState().busy, false);
  assert.deepEqual(useProjectStore.getState().retainedVariantIds, []);
});

test("deferred animation staging cannot add a variant after its project changed", async () => {
  const { animation, handlers, calls } = await harness();
  animation.setAnimationName("Edited clip");
  const gate = deferred(), started = deferred(); handlers.stage = () => { started.resolve(); return gate.promise; };
  const pending = animation.saveAnimationVariant();
  await started.promise;
  assert.equal(calls.staged.length, 1);
  useProjectStore.getState().newProject(); animation.resetAnimationSession();
  const variantId = useProjectStore.getState().activeVariantId;
  gate.resolve({ type: "staged", stagingId: crypto.randomUUID(), name: "Old animation.glb" }); await pending;
  assert.equal(useProjectStore.getState().variants.length, 1);
  assert.equal(useProjectStore.getState().activeVariantId, variantId);
  assert.equal(animation.useAnimationStore.getState().draft, null);
});

test("animation saving recovers after correcting a clip that failed synchronous validation", async () => {
  const { animation, calls } = await harness();
  animation.deleteAnimationKey("Head", "rotation", 0);
  animation.deleteAnimationKey("Head", "rotation", 30);
  await assert.rejects(animation.saveAnimationVariant(), /animation.invalidClip/);
  assert.equal(calls.staged.length, 0);
  assert.equal(animation.useAnimationStore.getState().busy, false);
  animation.setAnimationKey("Head", "rotation", 0, [0, 45, 0], "LINEAR");
  await animation.saveAnimationVariant();
  assert.equal(calls.staged.length, 1);
  assert.equal(useProjectStore.getState().variants.at(-1).origin, "animation");
  assert.equal(animation.useAnimationStore.getState().dirty, false);
});

for (const action of ["createPreset", "loadLibraryAnimation", "retargetLibraryAnimation"]) {
  test(`${action} stops when refreshing the displayed source fails`, async () => {
    const { animation, handlers, calls, variantId } = await harness(action === "createPreset");
    const before = structuredClone(animation.useAnimationStore.getState().draft);
    useProjectStore.getState().addVariant({ label: "Unsupported target", origin: "import", engineId: null, model: { type: "staged", stagingId: crypto.randomUUID(), name: "Unsupported.glb" }, lods: [], params: {} }, true);
    handlers.model = async () => { throw new Error("animation.unsupportedGlb"); };
    if (action === "createPreset") await animation.createPreset("idle");
    else await animation[action]("library-item", { Hips: "Hips", Head: "Head" });
    assert.equal(calls.libraryReads.length, 0);
    assert.deepEqual(animation.useAnimationStore.getState().draft, before);
    assert.equal(animation.useAnimationStore.getState().source.variantId, variantId);
    assert.equal(animation.useAnimationStore.getState().dirty, false);
    assert.equal(animation.useAnimationStore.getState().error, "animation.unsupportedGlb");
  });
}
