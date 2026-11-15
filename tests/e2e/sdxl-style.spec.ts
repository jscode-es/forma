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
    import {readFileSync,writeFileSync} from "node:fs";
    import {join} from "node:path";
    const job=JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job")+1],"utf8"));
    writeFileSync(join(job.outputDir,"image.png"),Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMioAAAAASUVORK5CYII=","base64"));
    console.log(JSON.stringify({type:"result",files:[{path:"image.png",kind:"image"}]}));
  `);
  const { app, page } = await launch(data, { demoEngines: false });
  try {
    await chooseEngine(page, "SDXL-Lightning", "Image engine");
    const gear = page.getByRole("button", { name: "SDXL style settings", exact: true });
    const help = page.getByRole("button", { name: "About SDXL-Lightning", exact: true });
    const g = (await gear.boundingBox())!;
    const h = (await help.boundingBox())!;
    expect(Math.abs(g.y - h.y)).toBeLessThan(2);
    expect(g.x).toBeGreaterThan(h.x);
    await gear.click();
    const style = page.getByRole("textbox", { name: "Shared visual style", exact: true });
    await style.fill("Low-poly, pastel colors, soft lighting");
    await expect(style).toHaveAttribute("maxlength", "256");
    await page.keyboard.press("Escape");
    await page.reload();
    await chooseEngine(page, "SDXL-Lightning", "Image engine");
    await gear.click();
    await expect(style).toHaveValue("Low-poly, pastel colors, soft lighting");
    await page.keyboard.press("Escape");
    await expect(page.evaluate(() => window.forma!.jobs.enqueue({ engineId: "sdxl-lightning", task: "text-to-image", projectId: null, parameters: { stylePrompt: 42 }, images: [], models: [], prompt: "Vase" }))).rejects.toThrow(/stylePrompt/);
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("Jarron chino");
    await page.getByRole("button", { name: "Generate images", exact: true }).click();
    const job = await waitForJob(page, "text-to-image");
    expect(job.parameters.stylePrompt).toBe("Low-poly, pastel colors, soft lighting");
    await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue("Jarron chino");
    await expect(page.getByRole("button", { name: 'Reuse the prompt "Jarron chino"', exact: true })).toBeVisible();
    await gear.click();
    await page.getByRole("button", { name: "Clear style", exact: true }).click();
    await expect(style).toHaveValue("");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: 'Reuse the prompt "Jarron chino"', exact: true }).click();
    await gear.click();
    await expect(style).toHaveValue("Low-poly, pastel colors, soft lighting");
    await page.getByRole("button", { name: "Clear style", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.reload();
    await chooseEngine(page, "SDXL-Lightning", "Image engine");
    await gear.click();
    await expect(style).toHaveValue("");
  } finally {
    await quit(app);
  }
});
