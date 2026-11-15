import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { axeViolations, chooseEngine, launch, quit, tempDataDir, waitForJob } from "./helpers";

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
  const description = page.getByText("Test engine without AI: simulates the stages of a generation and produces simple shapes and images.", { exact: true });
  await expect(description).toHaveCount(0);
  const help = page.getByRole("region", { name: /^References/ }).getByRole("button", { name: "About Forma demo", exact: true });
  await help.focus();
  await page.keyboard.press("Enter");
  await expect(description).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(description).toBeHidden();
  await page.getByRole("textbox", { name: "Prompt", exact: true }).fill("a red wooden chair");
  await page.getByRole("button", { name: "Generate images", exact: true }).click();
  const generatingImages = page.getByRole("button", { name: /^Generating images… \d+%$/ });
  await expect(generatingImages).toBeDisabled();
  await expect(generatingImages).toHaveAttribute("aria-busy", "true");
  await expect(generatingImages.locator('[data-slot="progress-fill"]')).toHaveCount(1);
  await expect(page.getByText(/^Generating images… \d+%$/)).toHaveCount(1);
  const job = await waitForJob(page, "text-to-image");
  await expect(page.getByRole("button", { name: "Generate images", exact: true })).toBeEnabled();
  expect(job.results.filter((r) => r.kind === "image")).toHaveLength(4);

  const candidates = page.getByRole("group", { name: "Candidates" }).locator("button[aria-pressed]");
  await expect(candidates).toHaveCount(4);
  const expand = page.getByRole("button", { name: "Enlarge candidate 1", exact: true });
  await page.mouse.move(500, 100);
  await expect(expand).toHaveCSS("opacity", "0");
  await candidates.first().hover();
  await expect(expand).toHaveCSS("opacity", "1");
  const thumbnail = candidates.first().locator("img");
  const thumbnailBounds = (await thumbnail.boundingBox())!;
  const thumbnailSource = (await thumbnail.getAttribute("src"))!;
  await expand.click();
  const preview = page.getByRole("dialog", { name: "Candidate 1", exact: true });
  const image = preview.getByRole("img", { name: "Candidate 1", exact: true });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", thumbnailSource);
  await expect(image).toHaveCSS("object-fit", "contain");
  expect((await image.boundingBox())!.width).toBeGreaterThan(thumbnailBounds.width * 2);
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
  await expect(candidates.first()).toHaveAttribute("aria-pressed", "false");
  await expect(expand).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  await expect(preview).toBeHidden();
  await page.getByRole("button", { name: "Use the image with seed 43", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use the image with seed 43", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Single view", exact: true }).click();
  await expect(page.getByText("Generated from a prompt · seed 43")).toBeVisible();
  await page.getByRole("tab", { name: "From text", exact: true }).click();
  await expect(page.getByRole("button", { name: 'Reuse the prompt "a red wooden chair"', exact: true })).toBeVisible();
});

test("generates the 3D model from the chosen candidate", async () => {
  await expect(page.getByRole("button", { name: "Continue in Create 3D", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Model", exact: true })).toBeVisible();
  await chooseEngine(page, "Forma demo");
  await page.getByRole("button", { name: "Generate model", exact: true }).click();
  const generatingModel = page.getByRole("button", { name: /^Generating model… \d+%$/ });
  await expect(generatingModel).toBeDisabled();
  await expect(generatingModel.locator('[data-slot="progress-fill"]')).toHaveCount(1);
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

  await page.getByRole("tab", { name: "From text", exact: true }).click();
  await page.getByRole("button", { name: 'Reuse the prompt "a red wooden chair"', exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Prompt", exact: true })).toHaveValue("a red wooden chair");
});
