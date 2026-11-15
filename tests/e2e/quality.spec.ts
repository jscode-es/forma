import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { axeViolations, chooseEngine, FIXTURES, launch, quit, ROOT, stubOpenDialog, tempDataDir } from "./helpers";

test("has no serious accessibility violations in any section, tab or dialog", async () => {
  test.setTimeout(300_000);
  const { app, page } = await launch(tempDataDir());
  const expandAll = async () => {
    const panel = page.locator("#inspector-panel");
    for (let round = 0; round < 3; round++) {
      const closed = panel.locator('h3 > button[aria-expanded="false"]');
      const count = await closed.count();
      if (!count) break;
      for (let index = count - 1; index >= 0; index--) await closed.nth(index).click();
    }
    await expect(panel.locator('h3 > button[aria-expanded="false"]')).toHaveCount(0);
    expect(await panel.locator('h3 > button[aria-expanded="true"]').count()).toBeGreaterThan(0);
  };
  const sections: [string, string[]][] = [
    ["Create 3D", ["Create", "Model", "Finish", "Edit"]],
    ["Create animation", ["Capture", "Skeleton", "Clips", "Character"]],
    ["Export", ["Files", "Interchange"]],
  ];
  try {
    const failures: string[] = [];
    const check = async (name: string) => failures.push(...(await axeViolations(page)).map((v) => `${name}: ${v}`));
    for (const tab of ["From text", "Multi-view", "Single view"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await check(`references ${tab}`);
    }
    for (const tab of ["Job queue", "Process", "Timeline", "Versions"]) {
      await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).first().click();
      await check(`dock ${tab}`);
    }
    for (const [section, tabs] of sections) {
      await page.getByRole("button", { name: section, exact: true }).first().click();
      for (const tab of tabs) {
        await page.getByRole("tab", { name: tab, exact: true }).click();
        await expandAll();
        await check(`${section} > ${tab}`);
      }
    }
    for (const dialog of ["Models", "Settings"]) {
      await page.getByRole("button", { name: dialog, exact: true }).click();
      await check(`${dialog} dialog`);
      await page.keyboard.press("Escape");
    }
    expect(failures).toEqual([]);
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
