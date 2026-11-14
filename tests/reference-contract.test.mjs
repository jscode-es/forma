import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { defaultScene, engineManifest, parseStoredScene, parseStoredSettings } from "../electron/schemas.ts";

test("older projects get independent empty texture engine settings", () => {
  const settings = parseStoredSettings(JSON.stringify({ quality: "balanced" }));
  assert.deepEqual(settings.textureEngine, { id: null, parameters: {} });
  assert.equal(settings.textureReferenceId, null);
});

test("preserves all existing references and the active model in older projects", () => {
  const scene = defaultScene();
  scene.variants[0].model = { type: "asset", assetId: randomUUID(), name: "Existing model" };
  scene.references = Array.from({ length: 8 }, () => ({
    id: randomUUID(), name: "Existing reference", width: 128, height: 128,
    original: { type: "asset", assetId: randomUUID() }, prepared: null, usePrepared: false,
  }));
  const parsed = parseStoredScene(JSON.stringify(scene));
  assert.equal(parsed.references.length, 8);
  assert.equal(parsed.variants[0].model.assetId, scene.variants[0].model.assetId);
});

test("multi-view plugin manifest validates with pinned local weight files", () => {
  const manifest = engineManifest.parse(JSON.parse(readFileSync("plugins/hunyuan3d-2-mv/forma-engine.json", "utf8")));
  assert.deepEqual(manifest.inputs.views, ["front", "back", "left", "right"]);
  assert.equal(manifest.inputs.images.max, 4);
  assert.equal(manifest.weights[0].source.revision.length, 40);
  assert.equal(manifest.weights[0].files.length, 2);
});
