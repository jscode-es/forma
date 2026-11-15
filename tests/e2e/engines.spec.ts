import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, quit, ROOT, tempDataDir } from "./helpers";

test("normal sessions exclude demo engines and sample downloads", async () => {
  const { app, page } = await launch(tempDataDir(), { demoEngines: false });
  try {
    const engines = await page.evaluate(() => window.forma!.engines.list());
    expect(engines.length).toBeGreaterThan(0);
    expect(engines.some((engine) => engine.demo || engine.id === "forma-demo")).toBe(false);
    const weights = await page.evaluate(() => window.forma!.weights.list());
    expect(weights.some((entry) => entry.engineId === "forma-demo")).toBe(false);
    await page.getByRole("tab", { name: "From text", exact: true }).click();
    await expect(page.getByText(/Forma demo/)).toHaveCount(0);
  } finally {
    await quit(app);
  }
});

test("surface resolution is a four-option select defaulting to 512 and saves the choice", async () => {
  const dataDir = tempDataDir();
  const engineDir = path.join(dataDir, "engines", "surface-test");
  fs.mkdirSync(engineDir, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "plugins/hunyuan3d-2/forma-engine.json"), "utf8"));
  Object.assign(manifest, { id: "surface-test", name: "Surface test", runtime: { type: "node", entry: "main.mjs" }, weights: [], requirements: { cuda: false, vramGb: 0 } });
  fs.writeFileSync(path.join(engineDir, "forma-engine.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(engineDir, "main.mjs"), "");
  const { app, page } = await launch(dataDir);
  try {
    await chooseEngine(page, "Surface test");
    const select = page.getByRole("combobox", { name: "Surface resolution", exact: true });
    const label = await page.getByText("Surface resolution", { exact: true }).boundingBox();
    const seed = await page.getByRole("spinbutton", { name: "Seed", exact: true }).boundingBox();
    const control = await select.locator("xpath=ancestor::div[contains(@style,'7rem')]").boundingBox();
    expect(Math.abs(label!.y + label!.height / 2 - (control!.y + control!.height / 2))).toBeLessThan(6);
    expect(Math.abs(control!.width - seed!.width)).toBeLessThan(2);
    await page.locator("#inspector-panel").screenshot({ path: "test-results/surface-resolution-row.png" });
    await select.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option")).toHaveText(["128", "256", "380", "512"]);
    await expect(page.getByRole("option", { name: "512", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("option", { name: "256", exact: true }).click();
    await page.keyboard.press("Control+s");
    await page.locator("#project-name").fill("Surface resolution");
    await page.getByRole("button", { name: "Save project", exact: true }).last().click();
    await expect(page.getByLabel("Unsaved changes", { exact: true })).toHaveCount(0);
    const project = await page.evaluate(() => window.forma!.projects.last());
    expect(project!.settings.engine.parameters.octreeResolution).toBe("256");
  } finally {
    await quit(app);
  }
});

test("generation selectors get defaults on startup and after creating a project", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    const expectSelection = async (name: string) => {
      const selector = page.getByRole("combobox", { name, exact: true });
      await selector.focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("option", { selected: true })).toHaveCount(1);
      await page.keyboard.press("Escape");
    };
    await expectSelection("Generation engine");
    await page.getByRole("tab", { name: "From text", exact: true }).click();
    await expectSelection("Image engine");
    await expect(page.getByLabel("Unsaved changes", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "New", exact: true }).click();
    await expectSelection("Image engine");
    await expectSelection("Generation engine");
  } finally {
    await quit(app);
  }
});
