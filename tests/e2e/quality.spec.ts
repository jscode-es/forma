import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { axeViolations, chooseEngine, FIXTURES, launch, quit, ROOT, stubOpenDialog, tempDataDir } from "./helpers";

test("has no serious accessibility violations in the main views", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    const views: [string, () => Promise<unknown>][] = [
      ["studio", async () => undefined],
      ["model tab", () => page.getByRole("tab", { name: "Model", exact: true }).click()],
      ["create animation", () => page.getByRole("button", { name: "Create animation", exact: true }).click()],
      ["export", () => page.getByRole("button", { name: "Export", exact: true }).click()],
      ["models dialog", () => page.getByRole("button", { name: "Models", exact: true }).click()],
    ];
    for (const [name, open] of views) {
      await open();
      expect((await axeViolations(page)).map((v) => `${name}: ${v}`)).toEqual([]);
    }
  } finally {
    await quit(app);
  }
});

test("meets the performance baseline", async () => {
  const toyCar = path.join(FIXTURES, "ToyCar.glb");
  test.skip(!fs.existsSync(toyCar), "run npm run fixtures first");

  const started = Date.now();
  const { app, page } = await launch(tempDataDir());
  const startup = Date.now() - started;
  try {
    await stubOpenDialog(app, toyCar);
    let t = Date.now();
    await page.getByRole("button", { name: "Import GLB", exact: true }).click();
    await expect(page.getByLabel("Model statistics")).toContainText("108,936 triangles");
    const loadToyCar = Date.now() - t;

    await chooseEngine(page, "Forma demo");
    await page.getByRole("spinbutton", { name: "Steps" }).fill("1");
    t = Date.now();
    await page.getByRole("button", { name: "Generate model", exact: true }).click();
    await expect(page.getByText("Preview: Forma demo")).toBeVisible();
    const jobRoundTrip = Date.now() - t;

    const memory = await app.evaluate(async ({ app: electronApp }) =>
      electronApp.getAppMetrics().reduce((sum, p) => sum + p.memory.workingSetSize, 0),
    );

    const metrics = { startupMs: startup, loadToyCarMs: loadToyCar, demoJobMs: jobRoundTrip, workingSetMb: Math.round(memory / 1024) };
    fs.mkdirSync(path.join(ROOT, "test-results"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "test-results", "performance.json"), JSON.stringify(metrics, null, 2));
    console.log("performance", metrics);

    expect(metrics.startupMs).toBeLessThan(20_000);
    expect(metrics.loadToyCarMs).toBeLessThan(10_000);
    expect(metrics.demoJobMs).toBeLessThan(10_000);
  } finally {
    await quit(app);
  }
});
