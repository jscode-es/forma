import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { Document, NodeIO } from "@gltf-transform/core";
import fs from "node:fs";
import path from "node:path";
import { launch, quit, tempDataDir, stubOpenDialog, stubSaveDialog, waitForJob, sha256 } from "./helpers";

test.describe.configure({ mode: "serial" });
const dataDir = tempDataDir();
const fixture = path.join(dataDir, "Sphere.glb");
let app: ElectronApplication;
let page: Page;
let originalHash: string;

test.beforeAll(async () => {
  ({ app, page } = await launch(dataDir));
  test.skip(!(await page.evaluate(() => window.forma!.system.blender(false))), "Install Blender 4+ to run real mesh tests");
  const positions = [0, 1, 0];
  const indices: number[] = [];
  for (let ring = 1; ring < 16; ring++) for (let slice = 0; slice < 32; slice++) {
    const theta = Math.PI * ring / 16, phi = Math.PI * 2 * slice / 32;
    positions.push(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
  }
  const bottom = positions.length / 3;
  positions.push(0, -1, 0);
  for (let slice = 0; slice < 32; slice++) {
    const next = (slice + 1) % 32;
    indices.push(0, 1 + next, 1 + slice);
    for (let ring = 0; ring < 14; ring++) {
      const a = 1 + ring * 32 + slice, b = a + 32, c = 1 + ring * 32 + next, d = c + 32;
      indices.push(a, c, b, c, d, b);
    }
    indices.push(bottom, 1 + 14 * 32 + slice, 1 + 14 * 32 + next);
  }
  const doc = new Document();
  const buffer = doc.createBuffer();
  const material = doc.createMaterial("Clay").setRoughnessFactor(0.27);
  const primitive = doc.createPrimitive().setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer)).setMaterial(material);
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(primitive)));
  fs.writeFileSync(fixture, await new NodeIO().writeBinary(doc));
  originalHash = sha256(fixture);
});

test.afterAll(async () => { if (app) await quit(app); });

test("inspects a real mesh without creating a model variant", async () => {
  await stubOpenDialog(app, fixture);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await page.getByRole("tab", { name: "Model", exact: true }).click();
  await page.getByRole("region", { name: "Inspect mesh", exact: true }).getByRole("button", { name: "Inspect mesh", exact: true }).click();
  const job = await waitForJob(page, "mesh-inspect");
  expect(job.results.some((f) => f.kind === "model")).toBe(false);
  await expect(page.locator("#inspector-panel dl")).toContainText("960");
  expect(sha256(fixture)).toBe(originalHash);
});

test("retopology produces a preview with a verified quad budget", async () => {
  await page.getByLabel("Quad face budget", { exact: true }).fill("256");
  await page.getByRole("button", { name: "Preview retopology", exact: true }).click();
  const job = await waitForJob(page, "retopology");
  const report = await page.evaluate(async (job) => JSON.parse(new TextDecoder().decode(await window.forma!.jobs.readFile(job.id, job.results.find((f) => f.kind === "mesh-report")!.path))), job);
  expect(report.details.method).toBe("quadriflow");
  expect(report.details.quadFaces).toBeLessThanOrEqual(256);
  expect(report.result.triangles).toBeLessThanOrEqual(512);
  await expect(page.getByText(/^Preview:.*retopology$/)).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  expect(sha256(fixture)).toBe(originalHash);
});

test("unwraps UVs and exports the template before and after applying", async () => {
  await page.getByRole("tab", { name: "Finish", exact: true }).click();
  await page.getByRole("combobox", { name: "Texture resolution", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: /^512/ }).click();
  await page.getByRole("button", { name: "Preview UVs", exact: true }).click();
  await waitForJob(page, "uv-unwrap");
  const button = page.getByRole("button", { name: "Export UV template", exact: true });
  await expect(button).toBeEnabled();
  const target = path.join(dataDir, "uv-template.png");
  await stubSaveDialog(app, target);
  await button.click();
  await expect.poll(() => fs.existsSync(target)).toBe(true);
  const png = fs.readFileSync(target);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.readUInt32BE(16)).toBe(512);
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await expect(button).toBeEnabled();
});

test("recalculates normals and bakes a detailed source into a new variant", async () => {
  await page.getByRole("button", { name: "Normals", exact: true }).click();
  await page.getByRole("button", { name: "Preview normals", exact: true }).click();
  await waitForJob(page, "normals");
  await expect(page.getByText(/^Preview:.*normals$/)).toBeVisible();
  await page.getByRole("button", { name: "Apply", exact: true }).first().click();
  await page.getByRole("combobox", { name: "Normals operation", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "Bake from detailed variant", exact: true }).click();
  await page.getByRole("combobox", { name: "Detailed source variant", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: "Sphere", exact: true }).click();
  await page.getByRole("button", { name: "Preview normals", exact: true }).click();
  const job = await waitForJob(page, "normals");
  const json = await page.evaluate(async (job) => {
    const bytes = await window.forma!.jobs.readFile(job.id, job.results.find((f) => f.kind === "model")!.path);
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
    return JSON.parse(new TextDecoder().decode(bytes.slice(20, 20 + length)));
  }, job);
  const normal = json.materials.find((m: { normalTexture?: { index: number } }) => m.normalTexture).normalTexture;
  expect(json.textures[normal.index].extras.formaMapSources.normal).toBe("baked");
  expect(json.images.every((image: { bufferView?: number }) => typeof image.bufferView === "number")).toBe(true);
  await expect(page.getByText(/^Preview:.*normals$/)).toBeVisible();
  expect(sha256(fixture)).toBe(originalHash);
});
