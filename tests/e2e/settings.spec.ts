import { expect, test } from "@playwright/test";
import { axeViolations, launch, quit, tempDataDir } from "./helpers";

test("settings keeps a bounded dialog with sidebar navigation and keyboard access", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await page.getByRole("tab", { name: "Create", exact: true }).click();
    await expect(page.getByRole("button", { name: "Automatic retopology", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Model", exact: true }).click();
    await expect(page.getByRole("button", { name: "Automatic retopology", exact: true })).toHaveCount(1);
    const retopology = page.getByRole("region", { name: "Automatic retopology", exact: true });
    await expect(retopology).toContainText("Instant Meshes + XAtlas");
    await expect(retopology).not.toContainText("Blender");
    await expect(retopology.getByRole("button", { name: "Activate Instant Meshes", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Configure Blender", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
    const general = dialog.getByRole("tab", { name: "General", exact: true });
    await expect(general).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("radiogroup", { name: "Language", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Open folder", exact: true })).toBeHidden();
    const initial = (await dialog.boundingBox())!;
    expect(initial.width).toBeGreaterThan(initial.height);
    expect(initial.height).toBeLessThanOrEqual(576);
    const height = await dialog.evaluate((element) => element.clientHeight);
    await general.focus();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("tab", { name: "Data folder", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("button", { name: "Open folder", exact: true })).toBeVisible();
    await dialog.getByRole("tab", { name: "Setup assistant", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Open the setup assistant", exact: true })).toBeVisible();
    await dialog.getByRole("tab", { name: "Updates", exact: true }).click();
    await expect(dialog.getByRole("switch", { name: "Check for updates when Forma starts" })).toBeVisible();
    await dialog.getByRole("tab", { name: "Hardware and engines", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Check again", exact: true })).toBeVisible();
    const blender = dialog.getByRole("button", { name: /^(Configure Blender|Change Blender executable)$/ });
    await expect(blender).toBeVisible();
    const blenderLabel = await blender.textContent();
    await app.evaluate(({ dialog: nativeDialog }) => {
      nativeDialog.showOpenDialog = (async () => ({ canceled: true, filePaths: [] })) as typeof nativeDialog.showOpenDialog;
    });
    await blender.click();
    await expect(blender).toBeEnabled();
    await expect(blender).toHaveText(blenderLabel!);
    expect(await dialog.evaluate((element) => element.clientHeight)).toBe(height);
    expect(await axeViolations(page)).toEqual([]);
    await page.screenshot({ path: "test-results/settings-sidebar.png" });
  } finally {
    await quit(app);
  }
});
