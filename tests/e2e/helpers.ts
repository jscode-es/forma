import { _electron as electron, expect, type ElectronApplication, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = path.resolve(__dirname, "..", "..");
export const FIXTURES = path.join(ROOT, "fixtures", "models");

export function tempDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "forma-e2e-"));
}

export async function launch(dataDir: string, { demoEngines = true } = {}): Promise<{ app: ElectronApplication; page: Page }> {
  const env = { ...process.env, FORMA_USER_DATA: dataDir, FORMA_TEST_ENGINES: demoEngines ? "1" : "0" } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.FORMA_DEV;
  const executablePath = process.env.FORMA_E2E_EXECUTABLE;
  const app = await electron.launch(executablePath ? { executablePath, env } : { args: [ROOT], cwd: ROOT, env });
  const page = await app.firstWindow();
  await page.evaluate(() => localStorage.setItem("forma-settings", JSON.stringify({ state: { locale: "en", theme: "dark", onboardingDone: true }, version: 0 })));
  await page.reload();
  await expect(page.getByLabel("Model statistics")).toBeVisible();
  return { app, page };
}

export async function stubOpenDialog(app: ElectronApplication, file: string) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [target] })) as typeof dialog.showOpenDialog;
  }, file);
}

export async function stubSaveDialog(app: ElectronApplication, file: string) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: target })) as typeof dialog.showSaveDialog;
  }, file);
}

export async function chooseEngine(page: Page, name: string, field = "Generation engine") {
  if (field === "Image engine") {
    await page.getByRole("tab", { name: "From text", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Create 3D", exact: true }).click();
    await page.getByRole("tab", { name: "Create", exact: true }).click();
  }
  await page.getByRole("combobox", { name: field }).focus();
  await page.keyboard.press("ArrowDown");
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

export async function waitForJob(page: Page, task: string) {
  await expect
    .poll(async () => page.evaluate(async (t) => (await window.forma!.jobs.list()).find((j) => j.task === t)?.status ?? "none", task), {
      timeout: 60_000,
    })
    .toMatch(/succeeded|failed|cancelled/);
  const job = await page.evaluate(async (t) => (await window.forma!.jobs.list()).find((j) => j.task === t)!, task);
  if (job.status !== "succeeded") {
    const log = await page.evaluate((id) => window.forma!.jobs.logs(id), job.id);
    throw new Error(`${task} job ${job.status}: ${job.error}
${log}`);
  }
  return job;
}

export async function quit(app: ElectronApplication) {
  const closed = app.waitForEvent("close");
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined);
  await closed;
}

export async function axeViolations(page: Page) {
  await page.addScriptTag({ path: require.resolve("axe-core") });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string; impact: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  });
}

export function sha256(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}


export async function openProject(page: Page, name: string) {
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("div").filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "Open", exact: true }) }).last().getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Project" })).toContainText(name);
}
