import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { launch, quit, tempDataDir, stubOpenDialog, stubSaveDialog, FIXTURES, waitForJob } from "./helpers";

test.describe.configure({ mode: "serial" });
const dataDir = tempDataDir();
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launch(dataDir)); });
test.afterAll(async () => { if (app) await quit(app); });

test("opens actual materials without an AI texture engine", async () => {
  const fixture = path.join(FIXTURES, "Avocado.glb");
  test.skip(!fs.existsSync(fixture), "run npm run fixtures first");
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByLabel("Model statistics")).toContainText("682 triangles");
  await page.getByRole("tab", { name: "Finish", exact: true }).click();
  await expect(page.getByLabel("Color", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview changes", exact: true })).toBeVisible();
  const isolate = page.getByRole("button", { name: "Isolate material", exact: true });
  await isolate.click();
  await expect(isolate).toHaveAttribute("aria-pressed", "true");
  await isolate.click();
  await expect(isolate).toHaveAttribute("aria-pressed", "false");
});

test("previews material factors without replacing the active version", async () => {
  await page.getByLabel("Color", { exact: true }).fill("#ff0000");
  await page.getByRole("button", { name: "Preview changes", exact: true }).click();
  await expect(page.getByText(/^Preview:/)).toBeVisible();
  const compare = page.locator("#inspector-panel").getByRole("button", { name: "Compare", exact: true });
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "true");
  await compare.click();
  await expect(compare).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Control+s");
  await page.locator("#project-name").fill("Material project");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  const beforeApply = (await page.evaluate(() => window.forma!.projects.last()))!;
  expect(beforeApply.scene.variants.find((v) => v.id === beforeApply.scene.activeVariantId)!.origin).toBe("import");
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  const project = await page.evaluate(() => window.forma!.projects.last());
  const active = project!.scene.variants.find((v) => v.id === project!.scene.activeVariantId)!;
  expect(active.origin).toBe("material");
  expect(active.parentId).toBe(project!.scene.variants.find((v) => v.origin === "import")!.id);
});

test("exports edited material factors and preserves embedded textures", async () => {
  const target = path.join(dataDir, "material.glb");
  await stubSaveDialog(app, target);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export GLB", exact: true }).last().click();
  await expect.poll(() => fs.existsSync(target)).toBe(true);
  const data = fs.readFileSync(target);
  const json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  expect(json.materials[0].pbrMetallicRoughness.baseColorFactor.slice(0, 3)).toEqual([1, 0, 0]);
  expect(json.images.length).toBeGreaterThan(0);
});

test("texture job contract preserves its source when active model changes", async () => {
  const engineDir = path.join(dataDir, "engines", "texture-contract");
  fs.mkdirSync(engineDir, { recursive: true });
  fs.writeFileSync(path.join(engineDir, "forma-engine.json"), JSON.stringify({
    id: "texture-contract", name: "Texture contract fixture", version: "1.0.0", license: "MIT", description: { en: "Protocol fixture, not AI inference" },
    tasks: ["texture"], runtime: { type: "node", entry: "main.mjs" }, inputs: { images: { min: 1, max: 1 }, models: { min: 1, max: 1 } },
  }));
  fs.writeFileSync(path.join(engineDir, "main.mjs"), `
import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const job=JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job")+1],"utf8"));
while(!existsSync(join(process.cwd(),"release")))await new Promise(resolve=>setTimeout(resolve,100));
copyFileSync(job.inputs.models[0],join(job.outputDir,"result.glb"));
console.log(JSON.stringify({type:"result",files:[{path:"result.glb",kind:"model",label:"Protocol result"}]}));
`);
  await page.reload();
  const sourceId = (await page.evaluate(() => window.forma!.projects.last()))!.scene.activeVariantId;
  const png = await app.evaluate(({ nativeImage }) => Array.from(nativeImage.createFromBitmap(Buffer.alloc(64 * 64 * 4, 255), { width: 64, height: 64 }).toPNG()));
  const reference = path.join(dataDir, "reference.png");
  fs.writeFileSync(reference, Buffer.from(png));
  await page.getByRole("tab", { name: "Single view", exact: true }).click();
  await stubOpenDialog(app, reference);
  await page.getByRole("button", { name: "Add the Front view", exact: true }).click();
  await page.getByRole("button", { name: "Create 3D", exact: true }).click();
  await page.getByRole("tab", { name: "Finish", exact: true }).click();
  await page.getByRole("combobox", { name: "Texture engine", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "Texture contract fixture", exact: true }).click();
  await page.getByRole("combobox", { name: "Texture reference", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: /Front/ }).click();
  await page.getByRole("button", { name: "Texture into a new version", exact: true }).click();
  await stubOpenDialog(app, path.join(FIXTURES, "Avocado.glb"));
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByLabel("Model statistics")).toContainText("682 triangles");
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  fs.writeFileSync(path.join(engineDir, "release"), "");
  await waitForJob(page, "texture");
  await expect(page.getByText("Preview: Texture contract fixture", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  const project = (await page.evaluate(() => window.forma!.projects.last()))!;
  expect(project.settings.textureEngine.id).toBe("texture-contract");
  expect(project.settings.textureReferenceId).toBe(project.scene.references[0].id);
  expect(project.scene.variants.find((v) => v.origin === "texture")!.parentId).toBe(sourceId);
  expect(project.scene.activeVariantId).not.toBe(sourceId);
});

test("imports a real albedo map into a preview and records its provenance", async () => {
  await stubOpenDialog(app, path.join(dataDir, "reference.png"));
  await page.getByRole("button", { name: "Import Albedo map", exact: true }).click();
  await expect(page.getByText("User imported map", { exact: true })).toBeVisible();
  await expect(page.getByText("64 × 64 px", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  const project = (await page.evaluate(() => window.forma!.projects.last()))!;
  const imported = project.scene.variants.find((v) => v.params.importedMap === "albedo")!;
  expect(imported.origin).toBe("texture");
  expect(project.scene.variants.some((v) => v.id === imported.parentId)).toBe(true);
});
