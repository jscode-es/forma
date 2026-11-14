import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { engineManifest, jobRequest, projectInput, DEFAULT_SETTINGS, defaultScene } from "../electron/schemas.ts";

test("the rig engine accepts bounded guide and rest-edit jobs through the existing contract", () => {
  const manifest = engineManifest.parse(JSON.parse(readFileSync(new URL("../engines/blender-rig/forma-engine.json", import.meta.url), "utf8")));
  assert.equal(manifest.id, "forma-blender-rig");
  assert.equal(manifest.runtime.type, "blender");
  assert.deepEqual(manifest.tasks, ["rig"]);
  const parameters = Object.fromEntries(manifest.parameters.map((parameter) => [parameter.id, parameter.default]));
  assert.equal(parameters.clipPolicy, "preserve");
  assert.equal(parameters.leftElbowX, .34);
  assert.equal(parameters.rightElbowX, -.34);
  const job = { engineId: manifest.id, task: "rig", projectId: null, parameters, images: [], models: [{ type: "staged", stagingId: "00000000-0000-4000-8000-000000000001", name: "Humanoid" }] };
  assert.equal(jobRequest.parse(job).parameters.headY, .98);
  assert.equal(jobRequest.parse({ ...job, parameters: { ...parameters, mode: "edit", boneIndex: 1, offsetX: .02 } }).parameters.mode, "edit");
  for (const parameter of manifest.parameters.filter((parameter) => parameter.type === "number")) {
    assert.ok(parameter.default >= parameter.min && parameter.default <= parameter.max);
  }
});

test("rig variants persist parent and explicit clip policy", () => {
  const scene = defaultScene();
  const source = scene.variants[0];
  scene.variants.push({ ...source, id: "00000000-0000-4000-8000-000000000002", origin: "rig", parentId: source.id, engineId: "forma-blender-rig", params: { mode: "edit", clipPolicy: "preserve", boneIndex: 2, offsetY: .03 } });
  const parsed = projectInput.parse({ name: "Rig test", settings: DEFAULT_SETTINGS, scene });
  assert.equal(parsed.scene.variants[1].origin, "rig");
  assert.equal(parsed.scene.variants[1].parentId, source.id);
  assert.equal(parsed.scene.variants[1].params.clipPolicy, "preserve");
});
