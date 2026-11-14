import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { chooseEngine, launch, quit, tempDataDir, waitForJob } from "./helpers";

test.describe.configure({ mode: "serial" });

const dataDir = tempDataDir();
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch(dataDir));
});

test.afterAll(async () => {
  if (app) await quit(app);
});

test("turns a prompt into candidate images and uses one as the reference", async () => {
  await chooseEngine(page, "Forma demo", "Image engine");
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("a red wooden chair");
  await page.getByRole("button", { name: "Generate images", exact: true }).click();
  const job = await waitForJob(page, "text-to-image");
  expect(job.results.filter((r) => r.kind === "image")).toHaveLength(4);

  const candidates = page.getByRole("group", { name: "Candidates" }).getByRole("button");
  await expect(candidates).toHaveCount(4);
  await page.getByRole("button", { name: "Use the image with seed 43", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use the image with seed 43", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Generated from a prompt · seed 43")).toBeVisible();
  await expect(page.getByRole("button", { name: 'Reuse the prompt "a red wooden chair"', exact: true })).toBeVisible();
});

test("generates the 3D model from the chosen candidate", async () => {
  await page.getByRole("button", { name: "Continue in Create 3D", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Model", exact: true })).toBeVisible();
  await chooseEngine(page, "Forma demo");
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  const job = await waitForJob(page, "image-to-3d");
  const log = await page.evaluate((id) => window.forma!.jobs.logs(id), job.id);
  expect(log).toContain("reference:");
  await expect(page.getByText("Preview: Forma demo")).toBeVisible();
});

test("saves the prompt history and seed with the project", async () => {
  await page.keyboard.press("Control+s");
  await page.locator("#project-name").fill("Prompt project");
  await page.getByRole("button", { name: "Save project", exact: true }).last().click();
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  await quit(app);

  ({ app, page } = await launch(dataDir));
  const project = await page.evaluate(() => window.forma!.projects.last());
  expect(project!.scene.prompts).toHaveLength(1);
  expect(project!.scene.prompts[0]).toMatchObject({ text: "a red wooden chair", engineId: "forma-demo", params: { seed: 42, count: 4 } });
  expect(project!.scene.references[0].prompt).toEqual({ text: "a red wooden chair", seed: 43, engineId: "forma-demo" });
  expect(project!.settings.imageEngine.id).toBe("forma-demo");

  await page.getByRole("button", { name: "Create reference", exact: true }).click();
  await page.getByRole("button", { name: 'Reuse the prompt "a red wooden chair"', exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue("a red wooden chair");
});
