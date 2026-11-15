import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { Document, NodeIO } from "@gltf-transform/core";
import fs from "node:fs";
import path from "node:path";
import { launch, quit, tempDataDir, stubOpenDialog, stubSaveDialog, sha256, axeViolations } from "./helpers";

test.describe.configure({ mode: "serial" });
const dataDir = tempDataDir();
const fixture = path.join(dataDir, "Canvas.glb");
let app: ElectronApplication;
let page: Page;
let originalHash: string;

test.beforeAll(async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const attribute = (name: "VEC3" | "VEC2", values: number[]) => doc.createAccessor().setType(name).setArray(new Float32Array(values)).setBuffer(buffer);
  const primitive = doc.createPrimitive().setMaterial(doc.createMaterial("Canvas").setRoughnessFactor(0.7).setMetallicFactor(0))
    .setAttribute("POSITION", attribute("VEC3", [-1, 0, 0, 1, 0, 0, 1, 2, 0, -1, 2, 0]))
    .setAttribute("NORMAL", attribute("VEC3", [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]))
    .setAttribute("TEXCOORD_0", attribute("VEC2", [0, 1, 1, 1, 1, 0, 0, 0]))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array([0, 1, 2, 0, 2, 3])).setBuffer(buffer));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  fs.writeFileSync(fixture, await new NodeIO().writeBinary(doc));
  originalHash = sha256(fixture);
  ({ app, page } = await launch(dataDir));
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByLabel("Model statistics")).toContainText("2 triangles");
  await page.getByRole("tab", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Paint 3D", exact: true }).click();
});

test.afterAll(async () => { if (app) await quit(app); });

async function stroke(x = 0, y = 0) {
  const bounds = await page.locator("main canvas").boundingBox();
  if (!bounds) throw new Error("Missing viewport canvas");
  const point = { x: bounds.x + bounds.width / 2 + x, y: bounds.y + bounds.height / 2 + y };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 10, point.y, { steps: 4 });
  await page.mouse.up();
}

test("paints a real mesh, undoes and redoes a stroke", async () => {
  await page.getByRole("button", { name: "Start painting", exact: true }).click();
  await expect(page.getByLabel("Paint color", { exact: true })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Camera views", exact: true }).click();
  await page.getByRole("menuitem", { name: "Front", exact: true }).click();
  await stroke();
  await expect(page.getByRole("button", { name: "Undo paint", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Undo paint", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save paint version", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Redo paint", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save paint version", exact: true })).toBeEnabled();
  expect(sha256(fixture)).toBe(originalHash);
});

test("orbits with the middle button while the brush is active without painting", async () => {
  const canvas = page.locator("main canvas");
  const bounds = (await canvas.boundingBox())!;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const undo = page.getByRole("button", { name: "Undo paint", exact: true });
  await undo.click();
  await expect(undo).toBeDisabled();
  const before = await canvas.screenshot();
  await page.mouse.move(center.x, center.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(center.x + 120, center.y + 30, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await page.waitForTimeout(600);
  expect((await canvas.screenshot()).equals(before)).toBe(false);
  await expect(undo).toBeDisabled();
  await page.getByRole("button", { name: "Redo paint", exact: true }).click();
  await page.getByRole("button", { name: "Camera views", exact: true }).click();
  await page.getByRole("menuitem", { name: "Front", exact: true }).click();
});

test("saving the project includes pending paint as a protected variant", async () => {
  await page.keyboard.press("Control+s");
  await page.getByLabel("Project name", { exact: true }).fill("Paint project");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Save paint version", exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Preview:.*paint$/)).toBeVisible();
});

test("exports actual painted pixels while preserving original geometry", async () => {
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const target = path.join(dataDir, "painted.glb");
  await stubSaveDialog(app, target);
  await page.getByRole("region", { name: "Export GLB", exact: true }).getByRole("button", { name: "Export GLB", exact: true }).click();
  await expect.poll(() => fs.existsSync(target)).toBe(true);
  const io = new NodeIO();
  const doc = await io.read(target);
  expect(doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices()!.getCount()).toBe(6);
  const texture = doc.getRoot().listMaterials()[0].getBaseColorTexture()!;
  const glb = fs.readFileSync(target);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  expect(json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index].extras).toMatchObject({ formaMapSources: { albedo: "painted" } });
  const pixels = await page.evaluate(async (image) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(image)], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const pixel = Array.from(context.getImageData(512, 512, 1, 1).data);
    bitmap.close();
    return pixel;
  }, Array.from(texture.getImage()!));
  expect(pixels[0]).toBeGreaterThan(200);
  expect(pixels[1]).toBeLessThan(120);
  expect(sha256(fixture)).toBe(originalHash);
});

test("clones, samples and restores the original paint surface", async () => {
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  await page.getByRole("button", { name: "Create 3D", exact: true }).click();
  await page.getByRole("tab", { name: "Finish", exact: true }).click();
  await page.getByRole("button", { name: "Paint 3D", exact: true }).click();
  await page.getByRole("button", { name: "Start painting", exact: true }).click();
  await expect(page.getByLabel("Paint color", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Camera views", exact: true }).click();
  await page.getByRole("menuitem", { name: "Front", exact: true }).click();
  await page.getByLabel("Paint color", { exact: true }).fill("#2040ff");
  await stroke();
  await page.getByRole("button", { name: "Clone", exact: true }).click();
  const bounds = (await page.locator("main canvas").boundingBox())!;
  const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.keyboard.down("Alt");
  await page.mouse.click(point.x, point.y);
  await page.keyboard.up("Alt");
  await stroke(24);
  await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
  await page.mouse.click(point.x + 24, point.y);
  await expect(page.getByLabel("Paint color", { exact: true })).toHaveValue("#2040ff");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await stroke();
  await page.getByRole("button", { name: "Eyedropper", exact: true }).click();
  await page.mouse.click(point.x, point.y);
  await expect(page.getByLabel("Paint color", { exact: true })).toHaveValue("#ff4040");
});

test("protects unsaved strokes on close and retains them after cancelling", async () => {
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  const dialog = page.getByRole("dialog", { name: "Save changes?", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save paint version", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Discard paint", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start painting", exact: true })).toBeVisible();
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
});

test("keeps pending strokes attached to their source when another model is imported", async () => {
  const sourceId = await page.evaluate(async () => (await window.forma!.projects.last())!.scene.activeVariantId);
  await page.getByRole("button", { name: "Start painting", exact: true }).click();
  await page.getByRole("button", { name: "Brush", exact: true }).click();
  await page.getByLabel("Paint color", { exact: true }).fill("#20ff40");
  await stroke();
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return to paint source", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save paint version", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Return to paint source", exact: true }).click();
  const paintVersions = page.getByText("Paint", { exact: true });
  const before = await paintVersions.count();
  await page.getByRole("button", { name: "Save paint version", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save paint version", exact: true })).toHaveCount(0);
  await expect(paintVersions).toHaveCount(before + 1);
  await page.keyboard.press("Control+s");
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  const parent = await page.evaluate(async () => (await window.forma!.projects.last())!.scene.variants.filter((variant) => variant.origin === "paint").at(-1)!.parentId);
  expect(parent).toBe(sourceId);
  expect(sha256(fixture)).toBe(originalHash);
});
