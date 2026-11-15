import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { chooseEngine, launch, quit, tempDataDir, waitForJob } from "./helpers";

test("generates a set of views from text and fills the multi-view slots", async () => {
  const dataDir = tempDataDir();
  const engineDir = path.join(dataDir, "engines", "multiview-fixture");
  fs.mkdirSync(engineDir, { recursive: true });
  fs.writeFileSync(path.join(engineDir, "forma-engine.json"), JSON.stringify({
    id: "multiview-fixture", name: "Multi-view fixture", version: "1.0.0", license: "MIT", description: { en: "Protocol fixture, not AI inference" },
    tasks: ["text-to-multiview"], runtime: { type: "node", entry: "main.mjs" },
    parameters: [{ id: "seed", type: "integer", label: { en: "Seed" }, min: 0, max: 1000, step: 1, default: 7 }],
  }));
  const { app, page } = await launch(dataDir);
  const png = await app.evaluate(({ nativeImage }) => {
    const bytes = Buffer.alloc(96 * 96 * 4);
    for (let y = 24; y < 72; y++) for (let x = 24; x < 72; x++) bytes.fill(255, (y * 96 + x) * 4, (y * 96 + x) * 4 + 4);
    return Array.from(nativeImage.createFromBitmap(bytes, { width: 96, height: 96 }).toPNG());
  });
  fs.writeFileSync(path.join(engineDir, "view.png"), Buffer.from(png));
  fs.writeFileSync(path.join(engineDir, "main.mjs"), `
import { readFileSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const job=JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job")+1],"utf8"));
const source=join(dirname(fileURLToPath(import.meta.url)),"view.png");
const files=["front","right","back","left"].map((view)=>{copyFileSync(source,join(job.outputDir,view+".png"));return {path:view+".png",kind:"image",label:view,meta:{seed:job.parameters.seed,set:0,view}};});
console.log(JSON.stringify({type:"result",files}));
`);
  try {
    await page.reload();
    await page.getByRole("tab", { name: "From text", exact: true }).click();
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("cofre del tesoro");
    await page.getByRole("switch", { name: "Multi-view", exact: true }).click();
    await expect(page.getByText(/several views of the same object/)).toBeVisible();
    await chooseEngine(page, "Multi-view fixture", "Image engine");
    await expect(page.getByText("Multi-view fixture", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate images", exact: true }).click();
    const job = await waitForJob(page, "text-to-multiview");
    expect(job.status).toBe("succeeded");
    const set = page.getByRole("group", { name: "Views with seed 7", exact: true });
    await expect(set.getByRole("img")).toHaveCount(4);
    await page.getByRole("complementary", { name: "Your workspace", exact: true }).screenshot({ path: "test-results/multiview-sets.png" });
    await set.getByRole("button", { name: "Use these views (seed 7)", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Multi-view", exact: true })).toHaveAttribute("aria-selected", "true");
    for (const view of ["Front", "Right", "Back", "Left"]) {
      await expect(page.getByRole("button", { name: `Replace the ${view} view`, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Add the Top view", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "From text", exact: true }).click();
    await expect(page.getByRole("button", { name: "Views in use (seed 7)", exact: true })).toBeVisible();
    await page.getByRole("switch", { name: "Multi-view", exact: true }).click();
    await expect(page.getByText("Multi-view fixture", { exact: true })).toBeHidden();
  } finally {
    await quit(app);
  }
});
