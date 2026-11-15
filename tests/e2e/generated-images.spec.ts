import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launch, quit, tempDataDir } from "./helpers";

test("generated candidates require real nonempty alpha, not an opaque checkerboard", async () => {
  const data = tempDataDir();
  const engine = path.join(data, "engines", "alpha-contract");
  fs.mkdirSync(engine, { recursive: true });
  fs.writeFileSync(path.join(engine, "forma-engine.json"), JSON.stringify({
    id: "alpha-contract", name: "Alpha contract", version: "1.0.0", license: "MIT", description: { en: "Protocol fixture" },
    tasks: ["text-to-image"], runtime: { type: "node", entry: "main.mjs" },
    parameters: [{ id: "mode", type: "enum", label: { en: "Mode" }, default: "transparent", options: ["transparent", "opaque", "empty", "late-opaque"].map((value) => ({ value, label: { en: value } })) }],
  }));
  fs.writeFileSync(path.join(engine, "main.mjs"), `
    import {readFileSync,copyFileSync} from "node:fs";
    import {join} from "node:path";
    const job=JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job")+1],"utf8"));
    copyFileSync(new URL((job.parameters.mode === "late-opaque" ? "transparent" : job.parameters.mode)+".png", import.meta.url),join(job.outputDir,"candidate.png"));
    console.log(JSON.stringify({type:"result",files:[{path:"candidate.png",kind:"image"}]}));
    if(job.parameters.mode === "late-opaque") {
      await new Promise(resolve=>setTimeout(resolve,250));
      copyFileSync(new URL("opaque.png",import.meta.url),join(job.outputDir,"candidate.png"));
    }
  `);
  const { app, page } = await launch(data);
  try {
    const fixtures = await app.evaluate(({ nativeImage }) => ["transparent", "opaque", "empty"].map((mode) => {
      const bitmap = Buffer.alloc(64 * 64 * 4);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const index = (y * 64 + x) * 4;
        bitmap.fill((Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 192 : 255, index, index + 3);
        bitmap[index + 3] = mode === "empty" ? 0 : mode === "opaque" || (x >= 16 && x < 48 && y >= 16 && y < 48) ? 255 : 0;
      }
      return { mode, png: Array.from(nativeImage.createFromBitmap(bitmap, { width: 64, height: 64 }).toPNG()) };
    }));
    for (const { mode, png } of fixtures) fs.writeFileSync(path.join(engine, `${mode}.png`), Buffer.from(png));
    for (const mode of ["transparent", "opaque", "empty", "late-opaque"]) {
      const job = await page.evaluate((mode) => window.forma!.jobs.enqueue({ engineId: "alpha-contract", task: "text-to-image", projectId: null, parameters: { mode }, images: [], models: [], prompt: "vase" }), mode);
      await expect.poll(() => page.evaluate(async (id) => (await window.forma!.jobs.list()).find((job) => job.id === id)?.status, job.id)).toBe(mode === "transparent" ? "succeeded" : "failed");
      const finished = await page.evaluate(async (id) => (await window.forma!.jobs.list()).find((job) => job.id === id)!, job.id);
      if (mode !== "transparent") {
        expect(finished.error).toBe("image-background-not-transparent");
        expect(finished.results).toHaveLength(0);
      }
    }
  } finally {
    await quit(app);
  }
});
