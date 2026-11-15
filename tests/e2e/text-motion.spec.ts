import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { launch, quit, tempDataDir } from "./helpers";

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launch(tempDataDir()));
});

test.afterAll(async () => {
  if (app) await quit(app);
});

test("offers the CLI providers and requires explicit consent before generating", async () => {
  const providers = await page.evaluate(() => window.forma!.system.motionProviders());
  expect(providers.map((provider) => provider.id)).toEqual(["codex", "claude", "copilot"]);
  const engines = await page.evaluate(() => window.forma!.engines.list());
  expect(engines.find((engine) => engine.id === "forma-text-motion")).toMatchObject({ network: true, tasks: ["text-to-motion"] });

  await page.getByRole("button", { name: "Create animation", exact: true }).first().click();
  await page.getByRole("tab", { name: "Capture", exact: true }).click();
  const trigger = page.getByRole("button", { name: "Motion from text", exact: true });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(page.getByRole("radio", { name: "Codex", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Motion description" }).fill("waves hello");
  const generate = page.getByRole("button", { name: "Generate motion from text", exact: true });
  await expect(generate).toBeDisabled();
  await expect(page.getByText(/Uses network and may consume your quota/)).toBeVisible();
});
