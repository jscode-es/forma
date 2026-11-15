import { expect, test } from "@playwright/test";
import en from "../../src/lib/i18n/locales/en.json";
import { axeViolations, launch, quit, tempDataDir } from "./helpers";

test("sidebar explanations are available through contextual help while operational states stay visible", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await expect(page.getByText(en.scene.importHint, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: `Help: ${en.scene.title}`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: `Help: ${en.scene.title}`, exact: true })).toContainText(en.scene.importHint);
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Multi-view", exact: true }).click();
    await expect(page.getByText(en.references.dropHint, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Help: References", exact: true }).click();
    const references = page.getByRole("dialog", { name: "Help: References", exact: true });
    await expect(references).toContainText(en.references.dropHint);
    await expect(references).toContainText(en.references.viewsHint);
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Model", exact: true }).click();
    await expect(page.getByText(en.inspector.sections.retopology.help, { exact: true })).toHaveCount(0);
    await expect(page.getByText(en.mesh.retopologyPolicy, { exact: true })).toHaveCount(0);
    await expect(page.getByText(en.mesh.needsModel, { exact: true }).first()).toBeVisible();
    const help = page.getByRole("button", { name: "Help: Automatic retopology", exact: true });
    await help.focus();
    await page.keyboard.press("Enter");
    const retopology = page.getByRole("dialog", { name: "Help: Automatic retopology", exact: true });
    await expect(retopology).toContainText(en.inspector.sections.retopology.help);
    await expect(retopology).toContainText(en.mesh.retopologyPolicy);
    await expect(retopology).toContainText(en.mesh.previewHint);
    expect(await axeViolations(page)).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(retopology).toBeHidden();
    await page.screenshot({ path: "test-results/sidebar-help.png" });
  } finally {
    await quit(app);
  }
});
