import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, quit, ROOT, tempDataDir, waitForJob } from "./helpers";

test("shared SDXL style stays beside engine help, persists and is captured in jobs", async () => {
  const data = tempDataDir();
  const directory = path.join(data, "engines", "sdxl-lightning");
  fs.mkdirSync(directory, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "plugins/sdxl-lightning/forma-engine.json"), "utf8"));
  Object.assign(manifest, { runtime: { type: "node", entry: "main.mjs" }, weights: [], requirements: { cuda: false, vramGb: 0 } });
  fs.writeFileSync(path.join(directory, "forma-engine.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, "main.mjs"), `
    import {readFileSync,copyFileSync} from "node:fs";
    import {join} from "node:path";
    const job=JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job")+1],"utf8"));
    copyFileSync(new URL("./fixture.png", import.meta.url),join(job.outputDir,"image.png"));
    console.log(JSON.stringify({type:"result",files:[{path:"image.png",kind:"image"}]}));
  `);
  const { app, page } = await launch(data, { demoEngines: false });
  try {
    const png = await app.evaluate(({ nativeImage }) => {
      const bitmap = Buffer.alloc(64 * 64 * 4);
      for (let y = 16; y < 48; y++) for (let x = 16; x < 48; x++) bitmap.fill(255, (y * 64 + x) * 4, (y * 64 + x) * 4 + 4);
      return Array.from(nativeImage.createFromBitmap(bitmap, { width: 64, height: 64 }).toPNG());
    });
    fs.writeFileSync(path.join(directory, "fixture.png"), Buffer.from(png));
    const shared = "Stylized hand-painted Japanese fantasy 3D, with charming diorama aesthetics, soft rounded geometry and rich handcrafted details. Vibrant, harmonious colors with warm pastel tones, lush greens, coral reds, turquoise blues and golden highlights.\nFine brush strokes and a matte finish on the requested object.";
    await chooseEngine(page, "SDXL-Lightning", "Image engine");
    const gear = page.getByRole("button", { name: "SDXL style settings", exact: true });
    const help = page.getByRole("button", { name: "About SDXL-Lightning", exact: true });
    const g = (await gear.boundingBox())!;
    const h = (await help.boundingBox())!;
    expect(Math.abs(g.y - h.y)).toBeLessThan(2);
    expect(g.x).toBeGreaterThan(h.x);
    await gear.click();
    const style = page.getByRole("textbox", { name: "Shared visual style", exact: true });
    await style.fill(shared);
    await expect(style).toHaveAttribute("maxlength", "2000");
    await expect(page.getByText(`${shared.length}/2000`, { exact: true })).toBeVisible();
    expect(shared.length).toBeGreaterThan(256);
    await page.keyboard.press("Escape");
    await page.reload();
    await chooseEngine(page, "SDXL-Lightning", "Image engine");
    await gear.click();
    await expect(style).toHaveValue(shared);
    await page.keyboard.press("Escape");
    await expect(page.evaluate(() => window.forma!.jobs.enqueue({ engineId: "sdxl-lightning", task: "text-to-image", projectId: null, parameters: { stylePrompt: 42 }, images: [], models: [], prompt: "Vase" }))).rejects.toThrow(/stylePrompt/);
    await expect(page.evaluate(() => window.forma!.jobs.enqueue({ engineId: "sdxl-lightning", task: "text-to-image", projectId: null, parameters: { stylePrompt: "x".repeat(2001) }, images: [], models: [], prompt: "Vase" }))).rejects.toThrow();
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Jarron chino");
    await page.getByRole("button", { name: "Generate images", exact: true }).click();
    const job = await waitForJob(page, "text-to-image");
    expect(job.parameters.stylePrompt).toBe(shared);
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue("Jarron chino");
    await expect(page.getByRole("button", { name: 'Reuse the prompt "Jarron chino"', exact: true })).toBeVisible();
    await gear.click();
    await page.getByRole("button", { name: "Clear style", exact: true }).click();
    await expect(style).toHaveValue("");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: 'Reuse the prompt "Jarron chino"', exact: true }).click();
    await gear.click();
    await expect(style).toHaveValue(shared);
    await page.getByRole("button", { name: "Clear style", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.reload();
    await chooseEngine(page, "SDXL-Lightning", "Image engine");
    await gear.click();
    await expect(style).toHaveValue("");
    await expect(page.getByText("0/2000", { exact: true })).toBeVisible();
  } finally {
    await quit(app);
  }
});
