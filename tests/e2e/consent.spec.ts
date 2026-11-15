import { expect, test } from "@playwright/test";
import path from "node:path";
import { chooseEngine, launch, quit, tempDataDir } from "./helpers";

test("asks for permission in a dialog before generating with an external CLI account", async () => {
  const savedPath = process.env.PATH;
  process.env.PATH = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  const { app, page } = await launch(tempDataDir());
  process.env.PATH = savedPath;
  try {
    await chooseEngine(page, "Codex images", "Image engine");
    await expect(page.getByRole("switch", { name: /Allow this generation/ })).toHaveCount(0);
    await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("cofre del tesoro");
    const generate = page.getByRole("button", { name: "Generate images", exact: true });
    await generate.click();
    const dialog = page.getByRole("dialog", { name: "Use your external account?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(async () => (await window.forma!.jobs.list()).length)).toBe(0);

    await generate.click();
    await dialog.getByRole("button", { name: "Allow and generate", exact: true }).click();
    await expect.poll(async () => (await page.evaluate(() => window.forma!.jobs.list()))[0]?.status).toBe("failed");
    const [job] = await page.evaluate(() => window.forma!.jobs.list());
    expect(job.parameters.consent).toBe(true);
    expect(job.error).toMatch(/provider-missing/);
  } finally {
    await quit(app);
  }
});
