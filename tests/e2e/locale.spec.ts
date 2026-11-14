import { expect, test } from "@playwright/test";
import { launch, quit, tempDataDir } from "./helpers";

test("system language follows Windows preferences instead of Chromium and survives reloads", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await app.evaluate(({ app }) => { app.getPreferredSystemLanguages = () => ["es-ES", "en-US"]; });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "languages", { get: () => ["en-US"] });
      Object.defineProperty(navigator, "language", { get: () => "en-US" });
    });
    await page.evaluate(() => localStorage.setItem("forma-settings", JSON.stringify({ state: { locale: "system", theme: "dark" }, version: 0 })));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("button", { name: "Crear 3D", exact: true })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("languagechange")));
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await app.evaluate(({ app }) => { app.getPreferredSystemLanguages = () => ["en-GB", "es-ES"]; });
    await page.evaluate(() => window.dispatchEvent(new Event("languagechange")));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await app.evaluate(({ app }) => { app.getPreferredSystemLanguages = () => ["es-ES"]; });
    await page.evaluate(() => window.dispatchEvent(new Event("languagechange")));
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.getByRole("button", { name: "Ajustes", exact: true }).click();
    await page.getByRole("radio", { name: "English", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.evaluate(() => window.dispatchEvent(new Event("languagechange")));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("radiogroup", { name: "Language", exact: true }).getByRole("radio", { name: "System", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  } finally {
    await quit(app);
  }
});
