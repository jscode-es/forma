import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, openProject, quit, stubOpenDialog, tempDataDir, waitForJob } from "./helpers";

test.describe.configure({ mode: "serial" });
const dataDir = tempDataDir();
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launch(dataDir)); });
test.afterAll(async () => { if (app) await quit(app); });

test("places three reference tabs below the main menu without a separate section", async () => {
  await expect(page.getByRole("button", { name: "Create reference", exact: true })).toHaveCount(0);
  const menu = page.getByRole("complementary", { name: "Your workspace", exact: true });
  const tabs = menu.getByRole("tablist", { name: "References", exact: true });
  await expect(tabs.getByRole("tab")).toHaveCount(3);
  await expect(tabs.getByRole("tab", { name: "Single view", exact: true })).toHaveAttribute("aria-selected", "true");
  await tabs.getByRole("tab", { name: "From text", exact: true }).click();
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("reference draft");
  await tabs.getByRole("tab", { name: "Multi-view", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Add the Front view", exact: true })).toBeVisible();
  const slots = menu.getByRole("group", { name: "Reference views", exact: true });
  const front = await slots.getByRole("group", { name: "Front", exact: true }).boundingBox();
  const back = await slots.getByRole("group", { name: "Back", exact: true }).boundingBox();
  const left = await slots.getByRole("group", { name: "Left", exact: true }).boundingBox();
  expect(Math.abs(front!.y - back!.y)).toBeLessThan(2);
  expect(back!.x).toBeGreaterThan(front!.x);
  expect(left!.y).toBeGreaterThan(front!.y);
  expect(front!.height).toBeGreaterThanOrEqual(44);
  await tabs.getByRole("tab", { name: "From text", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue("reference draft");
  await tabs.getByRole("tab", { name: "Single view", exact: true }).click();
  await menu.screenshot({ path: "test-results/reference-sidebar.png" });
});

test("migrates the removed section to Create 3D", async () => {
  await page.evaluate(() => localStorage.setItem("forma-workspace", JSON.stringify({
    state: { section: "createReference", tabs: { createReference: "views", create3d: "model" }, dockTab: "session", viewMode: "solid", showGrid: true }, version: 1,
  })));
  await page.reload();
  await expect(page.getByRole("button", { name: "Create 3D", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("tab", { name: "Model", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Single view", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("imports named views, reviews silhouettes and matches height", async () => {
  const pngs = await app.evaluate(({ nativeImage }) => {
    return [64, 96].map((height, index) => {
      const bytes = Buffer.alloc(128 * 128 * 4);
      for (let y = 8; y < 8 + height; y++) for (let x = 40; x < 80; x++) {
        const offset = (y * 128 + x) * 4;
        bytes[offset] = bytes[offset + 3] = 255;
      }
      return { index, bytes: Array.from(nativeImage.createFromBitmap(bytes, { width: 128, height: 128 }).toPNG()) };
    });
  });
  const images = pngs.map(({ index, bytes }) => {
    const file = path.join(dataDir, `view-${index}.png`);
    fs.writeFileSync(file, Buffer.from(bytes));
    return file;
  });
  await page.getByRole("tab", { name: "Multi-view", exact: true }).click();
  for (const [index, view] of ["Front", "Back"].entries()) {
    await stubOpenDialog(app, images[index]);
    await page.getByRole("button", { name: `Add the ${view} view`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Replace the ${view} view`, exact: true })).toBeVisible();
  }
  await expect(page.getByText(/object occupies different heights/)).toBeVisible();
  await page.getByRole("button", { name: "Replace the Front view", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Assign view", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Back", exact: true }).click();
  await expect(page.getByRole("group", { name: "Front", exact: true }).getByRole("img", { name: "view-1", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Back", exact: true }).getByRole("img", { name: "view-0", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Match reference heights", exact: true }).click();
  await expect(page.getByText(/object occupies different heights/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Match reference heights", exact: true })).toBeEnabled();
});

test("projects a named reference with alignment controls", async () => {
  await page.getByRole("button", { name: "Create 3D", exact: true }).click();
  await page.getByRole("tab", { name: "Edit", exact: true }).click();
  const select = page.getByRole("combobox", { name: "Project reference view" });
  await select.focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "Front", exact: true }).click();
  await expect(page.getByAltText("Projected Front reference")).toBeVisible();
  await page.getByLabel("Uniform scale", { exact: true }).fill("1.2");
  await expect(page.getByAltText("Projected Front reference")).toHaveCSS("transform", /1\.2/);
  await page.getByAltText("Projected Front reference").evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const canvas = page.locator("canvas").first();
  const before = await canvas.screenshot();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 100, bounds.y + bounds.height / 2 + 40, { steps: 8 });
  await page.mouse.up();
  const after = await canvas.screenshot();
  const unchanged = await page.evaluate(async ({ before, after }) => {
    const pixels = async (png: number[]) => {
      const image = await createImageBitmap(new Blob([new Uint8Array(png)]));
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      image.close();
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const a = await pixels(before);
    const b = await pixels(after);
    // GPU dithering can change channels by one without camera motion.
    return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= 1);
  }, { before: Array.from(before), after: Array.from(after) });
  expect(unchanged).toBe(true);
  await page.getByRole("button", { name: "Stop projection", exact: true }).click();
  await expect(page.getByAltText("Projected Front reference")).toHaveCount(0);
});

test("passes view assignments to the engine and preserves them on save", async () => {
  await chooseEngine(page, "Forma demo");
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  const job = await waitForJob(page, "image-to-3d");
  const log = await page.evaluate((id) => window.forma!.jobs.logs(id), job.id);
  expect(log).toContain("front");
  expect(log).toContain("back");
  const retry = await page.evaluate((id) => window.forma!.jobs.retry(id), job.id);
  await waitForJob(page, "image-to-3d");
  const retryLog = await page.evaluate((id) => window.forma!.jobs.logs(id), retry.id);
  expect(retryLog).toContain("view: front");
  expect(retryLog).toContain("view: back");
  await expect(page.getByText("Preview: Forma demo")).toBeVisible();
  await page.keyboard.press("Control+s");
  await page.locator("#project-name").fill("Multi-view project");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  await quit(app);
  ({ app, page } = await launch(dataDir));
  await openProject(page, "Multi-view project");
  const project = await page.evaluate(() => window.forma!.projects.last());
  expect(project!.scene.references.map((r) => r.view)).toEqual(["front", "back"]);
  expect(project!.scene.references.every((r) => r.prepared?.type === "asset" && r.usePrepared)).toBe(true);
});

test("rejects invalid image bytes and duplicate job views in main", async () => {
  const result = await page.evaluate(async () => {
    const errors: string[] = [];
    try { await window.forma!.references.stageBytes(new Uint8Array([1, 2, 3])); } catch { errors.push("invalid-image"); }
    const project = (await window.forma!.projects.last())!;
    const reference = project.scene.references[0];
    try {
      await window.forma!.jobs.enqueue({ engineId: "forma-demo", task: "image-to-3d", projectId: project.id, parameters: {}, images: [reference.original, reference.original], models: [], views: ["front", "front"] });
    } catch { errors.push("duplicate-view"); }
    try {
      await window.forma!.jobs.enqueue({ engineId: "forma-demo", task: "image-to-3d", projectId: project.id, parameters: {}, images: [reference.original, reference.original], models: [], views: ["front"] });
    } catch { errors.push("view-count"); }
    return errors;
  });
  expect(result).toEqual(["invalid-image", "duplicate-view", "view-count"]);
});

test("allows background removal with a multi-view engine without view assignments", async () => {
  const engineDir = path.join(dataDir, "engines", "test-mv-background");
  fs.mkdirSync(engineDir, { recursive: true });
  fs.writeFileSync(path.join(engineDir, "forma-engine.json"), JSON.stringify({
    id: "test-mv-background", name: "Test MV background", version: "1.0.0", license: "MIT",
    description: { en: "Multi-view background removal fixture" }, tasks: ["remove-background"],
    runtime: { type: "node", entry: "main.mjs" }, requirements: {},
    inputs: { images: { min: 1, max: 4 }, views: ["front", "back", "left", "right"] },
  }));
  fs.writeFileSync(path.join(engineDir, "main.mjs"), `
import { readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
const job = JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
copyFileSync(job.inputs.images[0], join(job.outputDir, "prepared.png"));
process.stdout.write(JSON.stringify({ type: "result", files: [{ path: "prepared.png", kind: "image", label: "Prepared" }] }) + "\\n");
`);
  await page.evaluate(async () => {
    const project = (await window.forma!.projects.last())!;
    await window.forma!.jobs.enqueue({ engineId: "test-mv-background", task: "remove-background", projectId: project.id, parameters: {}, images: [project.scene.references[0].original], models: [], views: [] });
  });
  const job = await waitForJob(page, "remove-background");
  expect(job.results[0].kind).toBe("image");
});

test("keeps other views when a generated candidate replaces the front", async () => {
  const backId = await page.evaluate(async () => (await window.forma!.projects.last())!.scene.references.find((r) => r.view === "back")!.id);
  await chooseEngine(page, "Forma demo", "Image engine");
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("another front view");
  await page.getByRole("button", { name: "Generate images", exact: true }).click();
  await waitForJob(page, "text-to-image");
  const candidate = page.getByRole("button", { name: "Use the image with seed 43", exact: true });
  await candidate.click();
  await expect(candidate).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  const project = await page.evaluate(() => window.forma!.projects.last());
  expect(project!.scene.references.map((r) => r.view)).toEqual(["front", "back"]);
  expect(project!.scene.references.find((r) => r.view === "back")!.id).toBe(backId);
});

test("drops images into single and multi-view slots without changing their size", async () => {
  const bytes = Array.from(fs.readFileSync(path.join(dataDir, "view-0.png")));
  await page.getByRole("tab", { name: "Single view", exact: true }).click();
  const front = page.getByRole("button", { name: "Replace the Front view", exact: true });
  const before = (await front.boundingBox())!;
  const transfer = await page.evaluateHandle((image) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(image)], "dropped-front.png", { type: "image/png" }));
    return data;
  }, bytes);
  await front.dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(front).toHaveClass(/dragging/);
  await front.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(front.getByRole("img", { name: "dropped-front", exact: true })).toBeVisible();
  const after = (await front.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThan(2);
  await page.getByRole("tab", { name: "Multi-view", exact: true }).click();
  const left = page.getByRole("button", { name: "Add the Left view", exact: true });
  await left.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByRole("button", { name: "Replace the Left view", exact: true }).getByRole("img", { name: "dropped-front", exact: true })).toBeVisible();
  const invalid = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["<svg></svg>"], "invalid.png", { type: "image/png" }));
    return data;
  });
  await page.getByRole("button", { name: "Add the Right view", exact: true }).dispatchEvent("drop", { dataTransfer: invalid });
  await expect(page.getByRole("group", { name: "Right", exact: true }).getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add the Right view", exact: true })).toBeVisible();
  await page.getByRole("complementary", { name: "Your workspace", exact: true }).screenshot({ path: "test-results/reference-grid.png" });
  await transfer.dispose();
  await invalid.dispose();
});

test("shows a remove button on hover that clears the view", async () => {
  const file = path.join(dataDir, "view-0.png");
  await page.getByRole("tab", { name: "Multi-view", exact: true }).click();
  const slot = page.getByRole("group", { name: "Left", exact: true });
  if (await slot.getByRole("button", { name: "Remove the Left view", exact: true }).count()) await slot.getByRole("button", { name: "Remove the Left view", exact: true }).click({ force: true });
  await stubOpenDialog(app, file);
  await slot.getByRole("button", { name: "Add the Left view", exact: true }).click();
  const remove = slot.getByRole("button", { name: "Remove the Left view", exact: true });
  await page.mouse.move(0, 0);
  await expect(remove).toHaveCSS("opacity", "0");
  await slot.hover();
  await expect(remove).toHaveCSS("opacity", "1");
  await slot.screenshot({ path: "test-results/reference-remove-hover.png" });
  await remove.click();
  await expect(slot.getByRole("button", { name: "Add the Left view", exact: true })).toBeVisible();
  await expect(remove).toHaveCount(0);
});

test("ignores files dropped outside a slot and never navigates away", async () => {
  const before = page.url();
  const handled = await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["x"], "model.glb", { type: "model/gltf-binary" }));
    const over = new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true });
    document.body.dispatchEvent(over);
    const drop = new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true });
    document.body.dispatchEvent(drop);
    return [over.defaultPrevented, drop.defaultPrevented];
  });
  expect(handled).toEqual([true, true]);
  await page.evaluate(() => { location.href = "file:///C:/"; }).catch(() => undefined);
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
  await expect(page.getByRole("tab", { name: "Multi-view", exact: true })).toBeVisible();
});
