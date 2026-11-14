import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { launch, quit, tempDataDir, stubOpenDialog, stubSaveDialog, sha256, waitForJob, ROOT, axeViolations } from "./helpers";

test.describe.configure({ mode: "serial" });
const dataDir = tempDataDir();
const fixture = path.join(dataDir, "Animated.glb");
const exportedClip = path.join(dataDir, "cycle.json");
let app: ElectronApplication;
let page: Page;
let originalHash: string;

function jsonOf(bytes: Uint8Array) { const data = Buffer.from(bytes); return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8")); }

test.beforeAll(async () => {
  const installed = path.join(os.homedir(), "AppData", "Roaming", "forma");
  const runtime = path.join(installed, "engines", "mediapipe-motion", ".venv", "Scripts", "python.exe");
  const model = path.join(installed, "models", "mediapipe-pose-lite", "1");
  if (fs.existsSync(runtime) && fs.existsSync(model)) {
    const engine = path.join(dataDir, "engines", "mediapipe-motion");
    fs.mkdirSync(engine, { recursive: true });
    for (const file of ["forma-engine.json", "main.py"]) fs.copyFileSync(path.join(ROOT, "plugins", "mediapipe-motion", file), path.join(engine, file));
    fs.writeFileSync(path.join(engine, "python.json"), JSON.stringify({ python: runtime }));
    fs.cpSync(model, path.join(dataDir, "models", "mediapipe-pose-lite", "1"), { recursive: true });
  }
  ({ app, page } = await launch(dataDir));
  const blender = await page.evaluate(() => window.forma!.system.blender(false));
  test.skip(!blender, "Blender is required to create a real animated humanoid fixture");
  const expression = `import sys; sys.path.insert(0, ${JSON.stringify(path.join(ROOT, "engines", "blender-rig").replaceAll("\\", "/"))}); from test_engine import create_animated_rig; create_animated_rig(${JSON.stringify(fixture.replaceAll("\\", "/"))})`;
  execFileSync(blender!.path, ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code", "1", "--python-expr", expression], { cwd: ROOT, windowsHide: true, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  originalHash = sha256(fixture);
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await page.getByRole("button", { name: "Create animation", exact: true }).first().click();
  await page.getByRole("tab", { name: "Clips", exact: true }).click();
});
test.afterAll(async () => { if (app) await quit(app); });

async function choose(label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).first().focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("loads real cubic animation and creates an editable humanoid preset", async () => {
  await page.getByRole("button", { name: "Load displayed rig", exact: true }).first().click();
  await expect(page.getByLabel("Clip name", { exact: true })).toHaveValue("Wave");
  await page.getByRole("button", { name: "Walk", exact: true }).click();
  await page.getByLabel("Clip name", { exact: true }).fill("Local cycle");
  await expect(page.getByRole("button", { name: "Save animation version", exact: true })).toBeEnabled();
  expect(await axeViolations(page)).toEqual([]);
  expect(sha256(fixture)).toBe(originalHash);
});

test("edits per-bone keys and interpolation with undo and redo", async () => {
  await page.getByLabel("Keyframe position", { exact: true }).fill("7");
  const rotation = page.getByRole("group", { name: "Local rotation (degrees)", exact: true });
  await rotation.getByLabel("Z", { exact: true }).fill("12");
  await choose("Track interpolation", "Step");
  await page.getByRole("button", { name: "Add keyframe", exact: true }).click();
  await expect(page.getByRole("button", { name: "Update keyframe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo animation edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add keyframe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Redo animation edit", exact: true }).click();
  await expect(page.getByRole("button", { name: "Update keyframe", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save to library", exact: true }).click();
  await expect.poll(async () => page.evaluate(async () => (await window.forma!.animations.list()).some((clip) => clip.name === "Local cycle"))).toBe(true);
});

test("plays and scrubs actual skin motion, then exports the animated GLB", async () => {
  await page.getByRole("tab", { name: "Timeline", exact: true }).click();
  const canvas = page.locator("main canvas");
  const before = await canvas.screenshot();
  const scrub = page.getByRole("slider", { name: "Animation timeline", exact: true });
  await scrub.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await page.getByRole("button", { name: "Play animation", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause animation", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause animation", exact: true }).click();
  await page.getByRole("button", { name: "Save animation version", exact: true }).click();
  await expect(page.getByText(/^Preview:.*Local cycle$/)).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const target = path.join(dataDir, "animated-export.glb");
  await stubSaveDialog(app, target);
  await page.getByRole("region", { name: "Export GLB", exact: true }).getByRole("button", { name: "Export GLB", exact: true }).click();
  await expect.poll(() => fs.existsSync(target)).toBe(true);
  const doc = jsonOf(fs.readFileSync(target));
  expect(doc.animations.map((clip: { name: string }) => clip.name)).toEqual(expect.arrayContaining(["Wave", "Local cycle"]));
  expect(doc.animations.find((clip: { name: string }) => clip.name === "Local cycle").samplers.some((sampler: { interpolation: string }) => sampler.interpolation === "STEP")).toBe(true);
  expect(sha256(fixture)).toBe(originalHash);
});

test("library survives project changes and native JSON export/import", async () => {
  await page.keyboard.press("Control+s");
  await page.getByLabel("Project name", { exact: true }).fill("Animation project");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByLabel("Unsaved changes", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("button", { name: "Create animation", exact: true }).first().click();
  await page.getByRole("tab", { name: "Clips", exact: true }).click();
  await choose("Library animation", "Local cycle");
  await stubSaveDialog(app, exportedClip);
  await page.getByRole("button", { name: "Export animation", exact: true }).click();
  await expect.poll(() => fs.existsSync(exportedClip)).toBe(true);
  expect(JSON.parse(fs.readFileSync(exportedClip, "utf8")).name).toBe("Local cycle");
  await stubOpenDialog(app, exportedClip);
  await page.getByRole("button", { name: "Import animation", exact: true }).click();
  await expect.poll(async () => page.evaluate(async () => (await window.forma!.animations.list()).filter((clip) => clip.name === "Local cycle").length)).toBe(2);
});

test("retargets a library clip through an explicit valid bone mapping", async () => {
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await page.getByRole("tab", { name: "Character", exact: true }).click();
  await page.getByRole("button", { name: "Load displayed rig", exact: true }).first().click();
  const id = await page.evaluate(async () => (await window.forma!.animations.list())[0].id);
  const selection = page.getByRole("combobox", { name: "Library animation", exact: true });
  await selection.focus(); await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "Local cycle", exact: true }).first().click();
  await page.getByRole("button", { name: "Map matching bone names", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retarget animation", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Retarget animation", exact: true }).click();
  await page.getByRole("tab", { name: "Clips", exact: true }).click();
  await expect(page.getByLabel("Clip name", { exact: true })).toHaveValue("Local cycle");
  await page.getByRole("button", { name: "Discard animation changes", exact: true }).click();
  expect(await page.evaluate((id) => window.forma!.animations.read(id), id)).toMatchObject({ name: "Local cycle" });
});

test("runs real local video pose inference and saves the motion as a version", async () => {
  const video = path.join(os.tmpdir(), "forma-motion-validation", "pose-world.mp4");
  const available = await page.evaluate(async () => (await window.forma!.engines.list()).some((engine) => engine.tasks.includes("video-to-motion") && engine.available));
  test.skip(!available || !fs.existsSync(video), "Install the authorized MediaPipe runtime/model and validation video");
  await page.getByRole("tab", { name: "Capture", exact: true }).click();
  await stubOpenDialog(app, video);
  await page.getByRole("button", { name: "Choose motion video", exact: true }).click();
  await page.getByRole("button", { name: "Generate video motion", exact: true }).click();
  const job = await waitForJob(page, "video-to-motion");
  const clip = await page.evaluate(async (job) => JSON.parse(new TextDecoder().decode(await window.forma!.jobs.readFile(job.id, job.results.find((file) => file.kind === "animation-clip")!.path))), job);
  expect(clip.tracks.length).toBeGreaterThan(10);
  expect(clip.tracks.some((track: { keys: { value: number[] }[] }) => track.keys.some((key) => key.value.some((value, index) => Math.abs(value - track.keys[0].value[index]) > .05)))).toBe(true);
  await page.getByRole("tab", { name: "Clips", exact: true }).click();
  await expect(page.getByLabel("Clip name", { exact: true })).toHaveValue(clip.name);
  await page.getByRole("button", { name: "Save animation version", exact: true }).click();
  await expect(page.getByText(new RegExp(`^Preview:.*${clip.name}$`))).toBeVisible();
  expect(sha256(fixture)).toBe(originalHash);
});
