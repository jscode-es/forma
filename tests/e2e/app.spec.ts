import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, FIXTURES, launch, sha256, stubOpenDialog, stubSaveDialog, tempDataDir, waitForJob } from "./helpers";

test.describe.configure({ mode: "serial" });

const dataDir = tempDataDir();
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch(dataDir));
});

test.afterAll(async () => {
  await app?.close();
});

test("starts with the default cube as the active version", async () => {
  await expect(page.getByLabel("Model statistics")).toContainText("12 triangles");
  await expect(page.getByText("Active: Cube")).toBeVisible();
});

test("generates with the demo engine, applies and saves the project", async () => {
  await chooseEngine(page, "Forma demo");
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  await waitForJob(page, "image-to-3d");

  await expect(page.getByText("Preview: Forma demo")).toBeVisible();
  await expect(page.getByLabel("Model statistics")).toContainText("8 triangles");
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await expect(page.getByText("Active: Forma demo")).toBeVisible();

  await page.keyboard.press("Control+s");
  await page.locator("#project-name").fill("E2E project");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
});

test("exports the active version and verifies its checksum", async () => {
  const target = path.join(dataDir, "export.glb");
  await stubSaveDialog(app, target);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export GLB", exact: true }).last().click();
  await expect(page.getByText(/verified/)).toBeVisible();

  const project = await page.evaluate(() => window.forma!.projects.last());
  const active = project!.scene.variants.find((v) => v.id === project!.scene.activeVariantId)!;
  expect(fs.readFileSync(target).subarray(0, 4).toString()).toBe("glTF");
  expect(sha256(target)).toBe(active.sha256);
});

test("optimizes an imported model into a new version with a LOD", async () => {
  const avocado = path.join(FIXTURES, "Avocado.glb");
  test.skip(!fs.existsSync(avocado), "run npm run fixtures first");

  await stubOpenDialog(app, avocado);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByLabel("Model statistics")).toContainText("682 triangles");

  await page.getByRole("button", { name: "Create 3D", exact: true }).click();
  await page.getByRole("tab", { name: "Model", exact: true }).click();
  await page.locator("#optimize-budget").fill("300");
  await page.locator("#optimize-lod1").fill("150");
  await page.getByRole("button", { name: "Optimize into a new version", exact: true }).click();
  await waitForJob(page, "optimize");

  await expect(page.getByText("Preview: Avocado · 300")).toBeVisible();
  const triangles = async () =>
    Number((await page.getByLabel("Model statistics").innerText()).match(/([\d,]+) triangles/)![1].replace(/,/g, ""));
  await expect.poll(triangles).toBeLessThanOrEqual(300);
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await expect(page.getByText("Active: Avocado · 300")).toBeVisible();
});

test("asks before discarding unsaved changes when closing", async () => {
  await page.getByRole("tab", { name: "Create", exact: true }).click();
  await page.getByRole("radio", { name: "High", exact: true }).click();
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await expect(page.getByText("Save changes?")).toBeVisible();
  await page.getByRole("button", { name: "Save and continue", exact: true }).click();
  await app.waitForEvent("close");
});

test("starts with the default cube and the last project's settings after a restart", async () => {
  ({ app, page } = await launch(dataDir));
  await expect(page.getByRole("navigation", { name: "Project" })).not.toContainText("E2E project");
  await expect(page.getByText("Active: Cube")).toBeVisible();
  await expect(page.getByRole("radio", { name: "High", exact: true })).toHaveAttribute("data-state", "on");
});
