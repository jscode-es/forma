import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import fs from "node:fs";
import path from "node:path";
import { launch, quit, tempDataDir, stubOpenDialog, stubSaveDialog, sha256, waitForJob, ROOT, axeViolations } from "./helpers";

test.describe.configure({ mode: "serial" });
const dataDir = tempDataDir();
const fixture = path.join(dataDir, "Humanoid.glb");
const animated = path.join(dataDir, "Animated.glb");
let app: ElectronApplication;
let page: Page;
let originalHash: string;
let riggedBytes: Uint8Array;

function jsonOf(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + view.getUint32(12, true))));
}

test.beforeAll(async () => {
  ({ app, page } = await launch(dataDir));
  const blender = await page.evaluate(() => window.forma!.system.blender(false));
  test.skip(!blender, "Install Blender 4+ to exercise real rig jobs");
  const modulePath = JSON.stringify(path.join(ROOT, "engines", "blender-rig").replaceAll("\\", "/"));
  const expression = `import sys; sys.path.insert(0, ${modulePath}); from test_engine import create_humanoid, create_animated_rig; create_humanoid(${JSON.stringify(fixture.replaceAll("\\", "/"))}); create_animated_rig(${JSON.stringify(animated.replaceAll("\\", "/"))})`;
  execFileSync(blender!.path, ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python-expr", expression], { cwd: ROOT, windowsHide: true, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  originalHash = sha256(fixture);
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByLabel("Model statistics")).not.toContainText("12 triangles");
  await page.getByRole("button", { name: "Create animation", exact: true }).click();
  await page.getByRole("tab", { name: "Skeleton", exact: true }).click();
});

test.afterAll(async () => { if (app) await quit(app); });

async function resultBytes() {
  const job = await waitForJob(page, "rig");
  const bytes = await page.evaluate(async (job) => window.forma!.jobs.readFile(job.id, job.results.find((file) => file.kind === "model")!.path), job);
  return { job, bytes: new Uint8Array(bytes) };
}

test("generates a real humanoid skin from adjustable guides without changing the source", async () => {
  await expect(page.getByRole("button", { name: "Preview humanoid rig", exact: true })).toBeEnabled();
  await page.getByRole("switch", { name: "Show body guides", exact: true }).click();
  await page.getByRole("group", { name: "Normalized guide position", exact: true }).getByLabel("X", { exact: true }).fill("0.01");
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Preview humanoid rig", exact: true }).click();
  const { job, bytes } = await resultBytes();
  expect(job.parameters.hipsX).toBe(.01);
  riggedBytes = bytes;
  const report = await page.evaluate(async (job) => JSON.parse(new TextDecoder().decode(await window.forma!.jobs.readFile(job.id, job.results.find((file) => file.kind === "rig-report")!.path))), job);
  expect(report.boneCount).toBe(19);
  expect(report.weightedVertices).toBeGreaterThan(100);
  expect(report.unweightedVertices).toBe(0);
  expect(jsonOf(bytes).skins[0].joints).toHaveLength(19);
  const doc = await new NodeIO().readBinary(bytes);
  for (const primitive of doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives())) {
    const weights = primitive.getAttribute("WEIGHTS_0")!;
    for (let index = 0; index < weights.getCount(); index++) {
      const values = weights.getElement(index, []);
      expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 4);
    }
  }
  await expect(page.getByText(/^Preview:.*rig$/)).toBeVisible();
  expect(sha256(fixture)).toBe(originalHash);
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
});

test("visualizes bones and weights, tests a pose and resets it", async () => {
  const canvas = page.locator("main canvas");
  await page.getByRole("switch", { name: "Show bones", exact: true }).click();
  const baseline = await canvas.screenshot();
  const pose = page.getByRole("group", { name: "Local pose rotation (degrees)", exact: true });
  await pose.getByLabel("Z", { exact: true }).fill("35");
  expect((await canvas.screenshot()).equals(baseline)).toBe(false);
  await page.getByRole("button", { name: "Reset pose", exact: true }).click();
  await expect(pose.getByLabel("Z", { exact: true })).toHaveValue("0");
  const rest = await canvas.screenshot();
  await page.getByRole("switch", { name: "Show skin weights", exact: true }).click();
  expect((await canvas.screenshot()).equals(rest)).toBe(false);
  await page.getByRole("switch", { name: "Show skin weights", exact: true }).click();
  expect(sha256(fixture)).toBe(originalHash);
});

test("edits a rest joint into a preview and exports a rig with unchanged mesh data", async () => {
  const offset = page.getByRole("group", { name: "Rest-position offset", exact: true });
  await offset.getByLabel("X", { exact: true }).fill("0.02");
  await page.getByRole("button", { name: "Preview rest-pose edit", exact: true }).click();
  const { bytes } = await resultBytes();
  const before = await new NodeIO().readBinary(riggedBytes);
  const after = await new NodeIO().readBinary(bytes);
  expect(Array.from(after.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")!.getArray()!)).toEqual(Array.from(before.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute("POSITION")!.getArray()!));
  expect(jsonOf(bytes).skins[0].joints).toHaveLength(19);
  await expect(page.getByText(/^Preview:.*rig edit$/)).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const target = path.join(dataDir, "rigged.glb");
  await stubSaveDialog(app, target);
  await page.getByRole("region", { name: "Export GLB", exact: true }).getByRole("button", { name: "Export GLB", exact: true }).click();
  await expect.poll(() => fs.existsSync(target)).toBe(true);
  expect(jsonOf(fs.readFileSync(target)).skins[0].joints).toHaveLength(19);
  expect(sha256(fixture)).toBe(originalHash);
});

test("preserves existing clips on edit and discards them only when explicitly selected", async () => {
  const initial = fs.readFileSync(animated);
  const source = jsonOf(initial);
  expect(source.animations.length).toBeGreaterThan(0);
  await stubOpenDialog(app, animated);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await page.getByRole("button", { name: "Create animation", exact: true }).first().click();
  await page.getByRole("tab", { name: "Skeleton", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview humanoid rig", exact: true })).toBeDisabled();
  await page.getByRole("group", { name: "Rest-position offset", exact: true }).getByLabel("Y", { exact: true }).fill("0.01");
  await page.getByRole("button", { name: "Preview rest-pose edit", exact: true }).click();
  expect(jsonOf((await resultBytes()).bytes).animations).toEqual(source.animations);
  const policy = page.getByRole("combobox", { name: "Animation clips", exact: true }).first();
  await policy.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "Discard clips explicitly", exact: true }).click();
  await page.getByRole("button", { name: "Preview rest-pose edit", exact: true }).click();
  expect(jsonOf((await resultBytes()).bytes).animations ?? []).toHaveLength(0);
  expect(fs.readFileSync(animated).equals(initial)).toBe(true);
});
