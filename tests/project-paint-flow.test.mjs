import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { currentScene, currentSettings, useProjectStore } from "../src/stores/project-store.ts";

const source = await readFile(new URL("../src/feature/projects/project-flow.ts", import.meta.url), "utf8");
const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
let harnessId = 0;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

async function harness() {
  useProjectStore.getState().newProject();
  useProjectStore.setState({ id: "project-before", name: "Before", dirty: false });
  const calls = { update: [], create: [], open: [], close: 0 };
  const project = (id, request = {}) => ({ id, name: request.name ?? id, settings: request.settings ?? currentSettings(), scene: request.scene ?? currentScene() });
  globalThis.window = { forma: {
    projects: {
      update: async (id, request) => { calls.update.push({ id, request }); return project(id, request); },
      create: async (request) => { calls.create.push(request); return project("created", request); },
      open: async (id) => { calls.open.push(id); return project(id); },
    },
    app: { confirmClose: async () => { calls.close++; } },
  } };
  const paintUrl = dataUrl(`
    export const state = { dirty: false, calls: 0, discarded: 0, blocks: [], save: () => Promise.resolve() };
    export const blockPainting = blocked => state.blocks.push(blocked);
    export const hasPaintChanges = () => state.dirty;
    export const discardPaint = () => { state.discarded++; state.dirty = false; };
    export const savePaintVariant = () => { state.calls++; return state.save(); };
    export const version = ${++harnessId};
  `);
  const animationUrl = dataUrl(`
    export const state = { dirty: false, calls: 0, discarded: 0, blocks: [], save: () => Promise.resolve() };
    export const blockAnimation = blocked => state.blocks.push(blocked);
    export const hasAnimationChanges = () => state.dirty;
    export const discardAnimation = () => { state.discarded++; state.dirty = false; };
    export const saveAnimationVariant = () => { state.calls++; return state.save(); };
    export const version = ${harnessId};
  `);
  let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  if (process.env.FORMA_PAINT_FLOW_MUTANT === "session") compiled = compiled.replaceAll("if (useProjectStore.getState().sessionId !== sessionId)\n            return;", "");
  if (process.env.FORMA_PAINT_FLOW_MUTANT === "busy") compiled = compiled.replaceAll("if (useProjectFlow.getState().busy)\n        return;", "");
  compiled = compiled
    .replace('from "zustand"', `from "${import.meta.resolve("zustand")}"`)
    .replace('from "@/stores/project-store"', `from "${new URL("../src/stores/project-store.ts", import.meta.url).href}"`)
    .replace('from "@/feature/paint"', `from "${paintUrl}"`)
    .replace('from "@/feature/animation"', `from "${animationUrl}"`);
  const flow = await import(dataUrl(compiled));
  const { state: paint } = await import(paintUrl);
  const { state: animation } = await import(animationUrl);
  return { flow, paint, animation, calls };
}

for (const mode of ["update", "create"]) {
  test(`paint save cannot ${mode} a project after its source session changed`, async () => {
    const { flow, paint, calls } = await harness();
    const gate = deferred(); paint.save = () => gate.promise;
    const save = mode === "update" ? flow.saveProject() : flow.saveProjectAs("Copy");
    assert.equal(flow.useProjectFlow.getState().busy, true);
    useProjectStore.getState().newProject();
    useProjectStore.setState({ id: "project-after", name: "After" });
    const nextSession = useProjectStore.getState().sessionId;
    gate.resolve(); await save;
    assert.equal(calls.update.length, 0);
    assert.equal(calls.create.length, 0);
    assert.equal(useProjectStore.getState().id, "project-after");
    assert.equal(useProjectStore.getState().sessionId, nextSession);
    assert.deepEqual(paint.blocks, [true, false]);
  });
}

test("duplicate save shortcuts and project changes are ignored while paint is saving", async () => {
  const { flow, paint, calls } = await harness();
  const gate = deferred(); paint.save = () => gate.promise;
  const session = useProjectStore.getState().sessionId;
  const save = flow.saveProject();
  flow.saveProject();
  flow.saveProjectAs("Duplicate");
  flow.openProject("other-project");
  flow.startNewProject();
  flow.requestClose();
  assert.equal(paint.calls, 1);
  assert.equal(calls.open.length, 0);
  assert.equal(calls.close, 0);
  assert.equal(flow.useProjectFlow.getState().saveOpen, false);
  assert.equal(flow.useProjectFlow.getState().guard, null);
  assert.equal(useProjectStore.getState().sessionId, session);
  gate.resolve(); await save;
  assert.equal(calls.update.length, 1);
  assert.equal(calls.create.length, 0);
  assert.deepEqual(paint.blocks, [true, false]);
});

for (const mode of ["update", "create"]) {
  test(`paint encoding failure prevents project ${mode} and continuation`, async () => {
    const { flow, paint, calls } = await harness();
    const gate = deferred(); paint.save = () => gate.promise;
    let continued = false;
    if (mode === "create") flow.useProjectFlow.setState({ afterSave: () => { continued = true; } });
    const save = mode === "update" ? flow.saveProject(() => { continued = true; }) : flow.saveProjectAs("Copy");
    gate.reject(new Error("paint.unsupportedImage")); await save;
    assert.equal(calls.update.length, 0); assert.equal(calls.create.length, 0);
    assert.equal(continued, false);
    assert.equal(flow.useProjectFlow.getState().error, "paint.unsupportedImage");
    assert.equal(flow.useProjectFlow.getState().busy, false);
    assert.deepEqual(paint.blocks, [true, false]);
  });
}

test("paint-only changes guard project navigation and cancel preserves the draft", async () => {
  const { flow, paint, calls } = await harness();
  paint.dirty = true;
  const session = useProjectStore.getState().sessionId;
  flow.openProject("other-project");
  assert.equal(typeof flow.useProjectFlow.getState().guard, "function");
  assert.equal(calls.open.length, 0);
  flow.resolveGuard("cancel");
  assert.equal(flow.useProjectFlow.getState().guard, null);
  assert.equal(paint.dirty, true); assert.equal(paint.discarded, 0);
  assert.equal(useProjectStore.getState().sessionId, session);
  assert.deepEqual(paint.blocks, []);
});

test("discarding guarded paint clears its draft before changing the project", async () => {
  const { flow, paint, calls } = await harness();
  paint.dirty = true;
  const session = useProjectStore.getState().sessionId;
  flow.startNewProject();
  await flow.resolveGuard("discard");
  assert.equal(paint.discarded, 1); assert.equal(paint.dirty, false);
  assert.equal(paint.calls, 0); assert.equal(calls.update.length, 0);
  assert.notEqual(useProjectStore.getState().sessionId, session);
  assert.equal(useProjectStore.getState().id, null);
  assert.deepEqual(paint.blocks, [true, false]);
});

test("saving guarded paint persists the resulting variant before navigating", async () => {
  const { flow, paint, calls } = await harness();
  paint.dirty = true;
  const gate = deferred();
  paint.save = async () => {
    await gate.promise;
    const project = useProjectStore.getState();
    project.addVariant({ label: "Painted", origin: "paint", engineId: null, model: project.variants[0].model, lods: [], params: {} }, false);
    paint.dirty = false;
  };
  flow.openProject("other-project");
  const save = flow.resolveGuard("save");
  assert.equal(calls.update.length, 0); assert.equal(calls.open.length, 0);
  gate.resolve(); await save;
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].request.scene.variants.at(-1).origin, "paint");
  assert.deepEqual(calls.open, ["other-project"]);
  assert.equal(useProjectStore.getState().id, "other-project");
});

test("renaming during deferred paint save persists the latest project name", async () => {
  const { flow, paint, calls } = await harness();
  const gate = deferred(); paint.save = () => gate.promise;
  const save = flow.saveProject();
  useProjectStore.getState().setName("Renamed during paint save");
  gate.resolve(); await save;
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].request.name, "Renamed during paint save");
  assert.equal(useProjectStore.getState().name, "Renamed during paint save");
  assert.equal(useProjectStore.getState().dirty, false);
});

for (const mode of ["update", "create"]) {
  test(`animation save cannot ${mode} a project after its source session changed`, async () => {
    const { flow, paint, animation, calls } = await harness();
    const started = deferred(), gate = deferred();
    animation.save = () => { started.resolve(); return gate.promise; };
    const save = mode === "update" ? flow.saveProject() : flow.saveProjectAs("Copy");
    await started.promise;
    assert.equal(animation.calls, 1);
    assert.equal(flow.useProjectFlow.getState().busy, true);
    useProjectStore.getState().newProject();
    useProjectStore.setState({ id: "project-after", name: "After" });
    const session = useProjectStore.getState().sessionId;
    gate.resolve(); await save;
    assert.equal(calls.update.length, 0); assert.equal(calls.create.length, 0);
    assert.equal(useProjectStore.getState().sessionId, session);
    assert.equal(useProjectStore.getState().id, "project-after");
    assert.deepEqual(paint.blocks, [true, false]);
    assert.deepEqual(animation.blocks, [true, false]);
  });
}

test("duplicate saves and project navigation stay blocked during deferred animation save", async () => {
  const { flow, animation, calls } = await harness();
  const started = deferred(), gate = deferred();
  animation.save = () => { started.resolve(); return gate.promise; };
  const session = useProjectStore.getState().sessionId;
  const save = flow.saveProject();
  await started.promise;
  await flow.saveProject(); await flow.saveProjectAs("Duplicate");
  await flow.openProject("other-project"); await flow.startNewProject(); await flow.requestClose();
  assert.equal(animation.calls, 1); assert.equal(calls.open.length, 0); assert.equal(calls.close, 0);
  assert.equal(flow.useProjectFlow.getState().saveOpen, false);
  assert.equal(flow.useProjectFlow.getState().guard, null);
  assert.equal(useProjectStore.getState().sessionId, session);
  gate.resolve(); await save;
  assert.equal(calls.update.length, 1); assert.equal(calls.create.length, 0);
  assert.deepEqual(animation.blocks, [true, false]);
});

for (const mode of ["update", "create"]) {
  test(`animation encoding failure prevents project ${mode} and continuation`, async () => {
    const { flow, paint, animation, calls } = await harness();
    const started = deferred(), gate = deferred();
    animation.save = () => { started.resolve(); return gate.promise; };
    let continued = false;
    if (mode === "create") flow.useProjectFlow.setState({ afterSave: () => { continued = true; } });
    const save = mode === "update" ? flow.saveProject(() => { continued = true; }) : flow.saveProjectAs("Copy");
    await started.promise;
    gate.reject(new Error("animation.incompatibleRig")); await save;
    assert.equal(calls.update.length, 0); assert.equal(calls.create.length, 0);
    assert.equal(continued, false);
    assert.equal(flow.useProjectFlow.getState().error, "animation.incompatibleRig");
    assert.equal(flow.useProjectFlow.getState().busy, false);
    assert.deepEqual(paint.blocks, [true, false]);
    assert.deepEqual(animation.blocks, [true, false]);
  });
}

test("animation-only changes guard navigation and cancelling preserves the draft", async () => {
  const { flow, paint, animation, calls } = await harness();
  animation.dirty = true;
  const session = useProjectStore.getState().sessionId;
  await flow.openProject("other-project");
  assert.equal(typeof flow.useProjectFlow.getState().guard, "function");
  assert.equal(calls.open.length, 0);
  await flow.resolveGuard("cancel");
  assert.equal(animation.dirty, true); assert.equal(animation.discarded, 0); assert.equal(paint.discarded, 0);
  assert.equal(flow.useProjectFlow.getState().guard, null);
  assert.equal(useProjectStore.getState().sessionId, session);
  assert.deepEqual(animation.blocks, []);
});

test("discarding guarded animation clears the draft before changing project", async () => {
  const { flow, paint, animation, calls } = await harness();
  animation.dirty = true;
  const session = useProjectStore.getState().sessionId;
  flow.startNewProject();
  await flow.resolveGuard("discard");
  assert.equal(animation.discarded, 1); assert.equal(animation.dirty, false);
  assert.equal(animation.calls, 0); assert.equal(calls.update.length, 0); assert.equal(calls.create.length, 0);
  assert.notEqual(useProjectStore.getState().sessionId, session);
  assert.equal(useProjectStore.getState().id, null);
  assert.deepEqual(paint.blocks, [true, false]);
  assert.deepEqual(animation.blocks, [true, false]);
});

for (const mode of ["update", "create"]) {
  test(`guarded animation is included before project ${mode} and navigation`, async () => {
    const { flow, animation, calls } = await harness();
    if (mode === "create") useProjectStore.setState({ id: null });
    animation.dirty = true;
    const started = deferred(), gate = deferred();
    animation.save = async () => {
      started.resolve(); await gate.promise;
      const project = useProjectStore.getState();
      project.addVariant({ label: "Animated", origin: "animation", engineId: null, model: project.variants[0].model, lods: [], params: { clipName: "Wave" } }, false);
      animation.dirty = false;
    };
    flow.openProject("other-project");
    let save = flow.resolveGuard("save");
    if (mode === "create") {
      assert.equal(flow.useProjectFlow.getState().saveOpen, true);
      save = flow.saveProjectAs("Animated copy");
    }
    await started.promise;
    assert.equal(calls.update.length, 0); assert.equal(calls.create.length, 0); assert.equal(calls.open.length, 0);
    gate.resolve(); await save;
    const request = mode === "update" ? calls.update[0].request : calls.create[0];
    assert.equal(request.scene.variants.at(-1).origin, "animation");
    assert.equal(request.scene.variants.at(-1).params.clipName, "Wave");
    assert.equal(mode === "update" ? calls.update.length : calls.create.length, 1);
    assert.deepEqual(calls.open, ["other-project"]);
    assert.equal(useProjectStore.getState().id, "other-project");
  });
}
