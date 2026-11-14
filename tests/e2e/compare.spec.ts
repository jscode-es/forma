import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, quit, stubSaveDialog, tempDataDir, waitForJob } from "./helpers";

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

test("renders two engine results with the same cameras and saves the sheet", async () => {
  await chooseEngine(page, "Forma demo");
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  const first = await waitForJob(page, "image-to-3d");
  await expect(page.getByText("Preview: Forma demo")).toBeVisible();
  await page.getByRole("radio", { name: "Pyramid", exact: true }).click();
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  await expect.poll(async () => page.evaluate(async (id) => (await window.forma!.jobs.list())[0].id !== id, first.id)).toBe(true);
  await waitForJob(page, "image-to-3d");
  await expect.poll(async () => page.getByText("Forma demo", { exact: true }).count()).toBeGreaterThanOrEqual(2);

  await page.getByRole("tab", { name: "Versions", exact: true }).click();
  await page.getByRole("button", { name: "Compare versions", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Compare versions" });
  await expect(dialog.getByRole("checkbox", { checked: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "Render comparison", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Comparison of 2 versions from four cameras" })).toBeVisible();

  const target = path.join(dataDir, "comparison.png");
  await stubSaveDialog(app, target);
  await dialog.getByRole("button", { name: "Save PNG", exact: true }).click();
  await expect(dialog.getByText(/Saved to/)).toBeVisible();
  const png = fs.readFileSync(target);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([300 + 4 * 320, 100 + 2 * 320]);
});
