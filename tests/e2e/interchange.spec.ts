import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, quit, sha256, stubOpenDialog, tempDataDir, waitForJob } from "./helpers";

test.describe.configure({ mode: "serial" });

const dataDir = tempDataDir();
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch(dataDir));
});

test.afterAll(async () => {
  if (app) await quit(app);
});

test("prepares a validated Godot package and exports it with verified checksums", async () => {
  await chooseEngine(page, "Forma demo");
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  await waitForJob(page, "image-to-3d");
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();

  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("tab", { name: "Interchange", exact: true }).click();
  await page.getByRole("radio", { name: "Godot", exact: true }).click();
  await page.getByRole("button", { name: "Prepare package", exact: true }).click();
  const job = await waitForJob(page, "export-package");
  expect(job.results.map((file) => file.path.replace(/^out\//, "")).sort()).toEqual(["README.md", "forma-package.json", "model.glb", "validation.json"]);
  await expect(page.getByRole("list", { name: "Package files" })).toContainText("0 errors · 0 warnings");

  const parent = path.join(dataDir, "exports");
  fs.mkdirSync(parent);
  await stubOpenDialog(app, parent);
  await page.getByRole("button", { name: "Export folder…", exact: true }).click();
  await expect(page.getByText(/Exported 4 files to/)).toBeVisible();

  const folder = path.join(parent, fs.readdirSync(parent)[0]);
  expect(path.basename(folder)).toMatch(/-godot$/);
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, "forma-package.json"), "utf8"));
  expect(manifest).toMatchObject({ format: 1, target: "godot", units: "meters", upAxis: "+Y" });
  for (const entry of manifest.files) expect(sha256(path.join(folder, entry.path))).toBe(entry.sha256);
  expect(fs.readFileSync(path.join(folder, "README.md"), "utf8")).toContain("Godot 4");
});
