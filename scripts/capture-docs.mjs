import { _electron as electron, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const images = path.join(root, "docs", "images");
const data = fs.mkdtempSync(path.join(os.tmpdir(), "forma-docs-"));
const model = path.join(root, "fixtures", "models", "ToyCar.glb");
if (!fs.existsSync(model)) throw new Error("Run npm run fixtures first");
fs.mkdirSync(images, { recursive: true });
const env = { ...process.env, FORMA_USER_DATA: data, FORMA_TEST_ENGINES: "0" };
delete env.ELECTRON_RUN_AS_NODE;
delete env.FORMA_DEV;
const app = await electron.launch({ args: [root], cwd: root, env });
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15_000);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setSize(1440, 1000);
  });
  await page.evaluate(() => localStorage.setItem("forma-settings", JSON.stringify({ state: { locale: "en", theme: "dark", onboardingDone: true }, version: 0 })));
  await page.reload();
  await expect(page.getByLabel("Model statistics")).toBeVisible();
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, model);
  await page.getByRole("button", { name: "Import GLB", exact: true }).click();
  await expect(page.getByText("Active: ToyCar", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Finish", exact: true }).click();
  await expect(page.getByLabel("Color", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "AI texture", exact: true }).click();
  await page.keyboard.press("Control+s");
  await page.locator("#project-name").fill("Toy car study");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const canvas = await page.locator("canvas").first().boundingBox();
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.wheel(0, -300);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  await page.screenshot({ animations: "disabled", path: path.join(images, "studio.png") });
  const inspector = page.getByRole("complementary", { name: "Configuration", exact: true });
  await inspector.screenshot({ animations: "disabled", path: path.join(images, "materials.png") });
  await page.getByRole("tab", { name: "Model", exact: true }).click();
  await page.getByRole("button", { name: "Automatic retopology", exact: true }).click();
  await page.getByRole("button", { name: "Inspect mesh", exact: true }).and(page.locator("[aria-expanded]")).click();
  await inspector.screenshot({ animations: "disabled", path: path.join(images, "model-tools.png") });
  await page.getByRole("tab", { name: "Multi-view", exact: true }).click();
  await page.getByRole("region", { name: /^References/ }).screenshot({ animations: "disabled", path: path.join(images, "references.png") });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("tab", { name: "Interchange", exact: true }).click();
  const bounds = await inspector.boundingBox();
  const content = await page.locator("#inspector-panel").boundingBox();
  await page.screenshot({ animations: "disabled", path: path.join(images, "export.png"), clip: { x: bounds.x, y: bounds.y, width: bounds.width, height: content.y + content.height - bounds.y + 16 } });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "Settings", exact: true }).screenshot({ animations: "disabled", path: path.join(images, "settings.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Models", exact: true }).click();
  await page.getByRole("dialog").screenshot({ animations: "disabled", path: path.join(images, "engines.png") });
  console.log(`Screenshots saved to ${images}; isolated data: ${data}`);
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
}
