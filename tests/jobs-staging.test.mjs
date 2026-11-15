import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { useProjectStore } from "../src/stores/project-store.ts";
import { useSettingsStore } from "../src/stores/settings-store.ts";

const dataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

test("SDXL snapshots the shared style in job parameters and preserves the object prompt", async () => {
  const { generateImages, useJobsStore } = await jobsModule();
  useProjectStore.getState().newProject();
  useProjectStore.setState({ prompt: "Jarron chino", imageEngine: { id: "sdxl-lightning", parameters: { seed: 42 } } });
  useSettingsStore.getState().setSdxlStyle("low-poly, pastel colors");
  useJobsStore.setState({ engines: [{ id: "sdxl-lightning", tasks: ["text-to-image"], parameters: [{ id: "stylePrompt", type: "string" }], inputs: { images: { max: 0 } } }] });
  let request;
  globalThis.window = { forma: { jobs: { enqueue: async (value) => {
    request = value;
    return { id: "style-job", parameters: value.parameters };
  } } } };
  await generateImages();
  assert.equal(request.prompt, "Jarron chino");
  assert.equal(request.parameters.stylePrompt, "low-poly, pastel colors");
  assert.equal(useProjectStore.getState().prompts[0].text, "Jarron chino");
  assert.equal(useProjectStore.getState().prompts[0].params.stylePrompt, "low-poly, pastel colors");
  useSettingsStore.getState().setSdxlStyle("");
  await generateImages();
  assert.equal(request.parameters.stylePrompt, "");
});

async function jobsModule() {
  let source = await readFile(new URL("../src/feature/jobs/jobs-store.ts", import.meta.url), "utf8");
  source = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  source = source.replace('from "zustand"', `from "${import.meta.resolve("zustand")}"`)
    .replace('from "@/lib/i18n"', `from "${dataUrl("export default {t: value=>value};")}"`)
    .replace('from "@/feature/mesh-tools"', `from "${dataUrl("export function recordMeshReport(){} export function recordUvTemplate(){}")}"`)
    .replace('from "@/feature/animation"', `from "${dataUrl("export function acceptVideoMotion(){} export function refreshAnimationLibrary(){} export const useAnimationStore={}; export function readAnimationModel(){} export function validateAnimationClip(){}")}"`)
    .replace('from "@/stores/project-store"', `from "${new URL("../src/stores/project-store.ts", import.meta.url).href}"`)
    .replace('from "@/stores/settings-store"', `from "${new URL("../src/stores/settings-store.ts", import.meta.url).href}"`)
    .replace('from "@/stores/workspace-store"', `from "${dataUrl("export const useWorkspaceStore={getState:()=>({setDockTab(){}})};")}"`)
    .replace('from "./scale"', `from "${dataUrl("export async function scaleGlbToHeight(bytes){return bytes;}")}"`)
    .replace('from "./mesh-report"', `from "${dataUrl("export function parseMeshReport(){}")}"`);
  return import(dataUrl(source));
}

test("generation staging cannot insert a model into a different project", async () => {
  const { applyFinishedJob, useJobsStore } = await jobsModule();
  useProjectStore.getState().newProject();
  let resolve;
  globalThis.window = { forma: { jobs: { stageResult: () => new Promise((accept) => { resolve = accept; }) } } };
  useJobsStore.setState({ pending: { job: { kind: "model", engineName: "Old model", sessionId: useProjectStore.getState().sessionId } } });
  const applying = applyFinishedJob({ id: "job", status: "succeeded", engineId: "engine", parameters: {}, results: [] });
  useProjectStore.getState().newProject();
  resolve({ type: "staged", stagingId: crypto.randomUUID(), name: "old.glb" });
  await applying;
  assert.equal(useProjectStore.getState().variants.length, 1);
  assert.equal(useProjectStore.getState().previewVariantId, null);
});

test("default selections prefer available real engines without marking the project dirty", async () => {
  const { selectDefaultEngines, useJobsStore } = await jobsModule();
  useProjectStore.getState().newProject();
  useJobsStore.setState({ engines: [
    { id: "demo", tasks: ["image-to-3d", "text-to-image", "texture"], available: true, demo: true },
    { id: "missing-weights", tasks: ["image-to-3d"], available: false },
    { id: "mesh", tasks: ["image-to-3d"], available: true },
    { id: "images", tasks: ["text-to-image"], available: true },
    { id: "texture", tasks: ["texture"], available: true },
  ] });
  selectDefaultEngines();
  const state = useProjectStore.getState();
  assert.equal(state.engine.id, "mesh");
  assert.equal(state.imageEngine.id, "images");
  assert.equal(state.textureEngine.id, "texture");
  assert.equal(state.dirty, false);
  const selection = state.engine;
  selectDefaultEngines();
  assert.equal(useProjectStore.getState().engine, selection);
});

test("saved engine choices and parameters survive refresh even when weights are missing", async () => {
  const { selectDefaultEngines, useJobsStore } = await jobsModule();
  useProjectStore.getState().newProject();
  const selection = { id: "saved", parameters: { steps: 24 } };
  useProjectStore.setState({ engine: selection });
  useJobsStore.setState({ engines: [
    { id: "other", tasks: ["image-to-3d"], available: true },
    { id: "saved", tasks: ["image-to-3d"], available: false },
  ] });
  selectDefaultEngines();
  assert.equal(useProjectStore.getState().engine, selection);
});

test("removed engines get defaults with fresh parameters and unready engines can be selected", async () => {
  const { selectDefaultEngines, useJobsStore } = await jobsModule();
  useProjectStore.getState().newProject();
  useProjectStore.setState({ imageEngine: { id: "removed", parameters: { consent: true } } });
  useJobsStore.setState({ engines: [{ id: "new", tasks: ["text-to-image"], available: false }] });
  selectDefaultEngines();
  assert.deepEqual(useProjectStore.getState().imageEngine, { id: "new", parameters: {} });
  useJobsStore.setState({ engines: [] });
  selectDefaultEngines();
  assert.equal(useProjectStore.getState().imageEngine.id, "new");
});
