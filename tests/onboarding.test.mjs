import assert from "node:assert/strict";
import test from "node:test";
import { estimateDiskGb, recommend } from "../src/feature/onboarding/recommend.ts";

const GB = 1024 ** 3;
const plugin = (id, extra = {}) => ({
  id,
  name: id,
  status: "available",
  requirements: { vramGb: 8, cuda: true, python: "3.11", diskGb: 9 },
  runtime: { id: "torch-cu128", ready: false },
  weights: [],
  ...extra,
});
const gpu = { gpu: "RTX", vramMb: 12227, driver: "1", cuda: "13.4", diskFreeBytes: 500 * GB, python: null };

test("platform-specific plugins are incompatible outside their supported platforms", () => {
  const instant = plugin("instant-meshes", { requirements: { platforms: ["win32"], vramGb: 0, cuda: false, python: "3.11", diskGb: 0.3 } });
  assert.equal(recommend([instant], gpu, "python", "linux")[0].reason, "platform");
  assert.equal(recommend([instant], gpu, "python", "darwin")[0].fit, "incompatible");
  assert.equal(recommend([instant], gpu, "python", "win32")[0].fit, "optional");
});

test("recommends the core GPU engines and marks the rest optional", () => {
  const list = recommend([plugin("hunyuan3d-2-mv"), plugin("sdxl-lightning"), plugin("hunyuan3d-2"), plugin("mediapipe-motion", { requirements: { vramGb: 0, cuda: false, python: "3.11", diskGb: 1.2 }, runtime: null })], gpu, "python.exe");
  assert.deepEqual(list.map((entry) => [entry.plugin.id, entry.fit]), [["hunyuan3d-2", "recommended"], ["sdxl-lightning", "recommended"], ["hunyuan3d-2-mv", "optional"], ["mediapipe-motion", "optional"]]);
});

test("explains why an engine does not fit", () => {
  assert.equal(recommend([plugin("hunyuan3d-2")], { ...gpu, cuda: null }, "python.exe")[0].reason, "cuda");
  assert.equal(recommend([plugin("hunyuan3d-2", { requirements: { vramGb: 24, cuda: true, python: "3.11", diskGb: 9 } })], gpu, "python.exe")[0].reason, "vram");
  assert.equal(recommend([plugin("hunyuan3d-2")], gpu, null)[0].reason, "python");
  assert.equal(recommend([plugin("hunyuan3d-2", { status: "installed" })], { ...gpu, cuda: null }, null)[0].fit, "installed");
});

test("counts the shared runtime once and shared weights once", () => {
  const shared = { id: "birefnet", sizeBytes: 1 * GB };
  const selected = [plugin("hunyuan3d-2", { weights: [shared, { id: "dit", sizeBytes: 5 * GB }] }), plugin("hunyuan3d-2-mv", { weights: [shared, { id: "mv", sizeBytes: 5 * GB }] })];
  assert.equal(Math.round(estimateDiskGb(selected, []) * 10) / 10, 6.5 + 0.2 + 11);
  assert.equal(Math.round(estimateDiskGb(selected, [{ id: "birefnet", status: "installed" }]) * 10) / 10, 6.5 + 0.2 + 10);
  const ready = selected.map((entry) => ({ ...entry, runtime: { id: "torch-cu128", ready: true } }));
  assert.equal(Math.round(estimateDiskGb(ready, []) * 10) / 10, 0.2 + 11);
});
