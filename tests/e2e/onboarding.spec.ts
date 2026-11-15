import { expect, test } from "@playwright/test";
import { launch, quit, tempDataDir } from "./helpers";

test("opens on first run, explains every engine and is not shown again after skipping", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await page.evaluate(() => localStorage.setItem("forma-settings", JSON.stringify({ state: { locale: "en", theme: "dark" }, version: 0 })));
    await page.reload();
    const dialog = page.getByRole("dialog", { name: "Setup assistant" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Python 3.11", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Next", exact: true }).click();

    const engines = dialog.getByRole("list", { name: "Engines" });
    await expect(engines.getByRole("listitem")).toHaveCount(7);
    const hardware = await page.evaluate(() => window.forma!.system.hardware(false));
    if (!hardware.cuda) {
      await expect(engines.getByText("Not compatible").first()).toBeVisible();
      await expect(engines.getByText("Needs an NVIDIA GPU with CUDA").first()).toBeVisible();
    }
    await expect(dialog.getByText(/GB of disk/)).toBeVisible();

    await dialog.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await page.waitForTimeout(1500);
    await expect(dialog).toBeHidden();

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("tab", { name: "Setup assistant", exact: true }).click();
    await page.getByRole("button", { name: "Open the setup assistant", exact: true }).click();
    await expect(dialog).toBeVisible();
  } finally {
    await quit(app);
  }
});
