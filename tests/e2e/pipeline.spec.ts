import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, quit, stubOpenDialog, tempDataDir, waitForJob } from "./helpers";

test("generates, optimizes for games and textures from the references in one run", async () => {
  const dataDir = tempDataDir();
  const engineDir = path.join(dataDir, "engines", "texture-pipeline");
  fs.mkdirSync(engineDir, { recursive: true });
  fs.writeFileSync(path.join(engineDir, "forma-engine.json"), JSON.stringify({
    id: "texture-pipeline", name: "Texture pipeline fixture", version: "1.0.0", license: "MIT", description: { en: "Protocol fixture, not AI inference" },
    tasks: ["texture"], runtime: { type: "node", entry: "main.mjs" }, inputs: { images: { min: 1, max: 1 }, models: { min: 1, max: 1 } },
  }));
  fs.writeFileSync(path.join(engineDir, "main.mjs"), `
import { readFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
const job=JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job")+1],"utf8"));
copyFileSync(job.inputs.models[0],join(job.outputDir,"result.glb"));
console.log(JSON.stringify({type:"result",files:[{path:"result.glb",kind:"model",label:"Textured"}]}));
`);
  const { app, page } = await launch(dataDir);
  try {
    const switchTexture = page.getByRole("switch", { name: "Apply texture from the references", exact: true });
    await chooseEngine(page, "Forma demo");
    await expect(switchTexture).toBeDisabled();
    await expect(page.getByText("Activate a texture engine and add a reference to enable it.")).toBeVisible();

    const png = await app.evaluate(({ nativeImage }) => Array.from(nativeImage.createFromBitmap(Buffer.alloc(64 * 64 * 4, 255), { width: 64, height: 64 }).toPNG()));
    const reference = path.join(dataDir, "reference.png");
    fs.writeFileSync(reference, Buffer.from(png));
    await page.getByRole("tab", { name: "Single view", exact: true }).click();
    await stubOpenDialog(app, reference);
    await page.getByRole("button", { name: "Add the Front view", exact: true }).click();
    await expect(page.getByRole("button", { name: "Replace the Front view", exact: true })).toBeVisible();

    await expect(switchTexture).toBeEnabled();
    await switchTexture.click();
    await page.getByRole("switch", { name: "Optimize for games", exact: true }).click();
    await page.getByLabel("Triangle budget", { exact: true }).fill("2000");
    await page.locator("#inspector-panel").screenshot({ path: "test-results/pipeline-section.png" });
    await page.getByRole("button", { name: "Generate model", exact: true }).click();

    const textured = await waitForJob(page, "texture");
    expect(textured.status).toBe("succeeded");
    const optimized = await waitForJob(page, "optimize");
    expect(optimized.parameters.budget).toBe(2000);
    await page.keyboard.press("Control+s");
    await page.locator("#project-name").fill("Pipeline");
    await page.getByRole("button", { name: "Save project", exact: true }).last().click();
    await expect(page.getByLabel("Unsaved changes", { exact: true })).toHaveCount(0);
    const project = (await page.evaluate(() => window.forma!.projects.last()))!;
    const byId = new Map(project.scene.variants.map((v) => [v.id, v]));
    const texture = project.scene.variants.find((v) => v.origin === "texture")!;
    const optimize = byId.get(texture.parentId!)!;
    expect(optimize.origin).toBe("optimize");
    expect(byId.get(optimize.parentId!)!.origin).toBe("generation");
    expect(project.settings).toMatchObject({ autoTexture: true, gameReady: true, gameBudget: 2000 });
  } finally {
    await quit(app);
  }
});
