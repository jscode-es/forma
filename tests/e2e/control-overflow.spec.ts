import { expect, test, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { launch, quit, stubOpenDialog, tempDataDir } from "./helpers";

async function horizontalFocusRoom(control: Locator) {
  return control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    let room = Infinity;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (!["hidden", "auto", "scroll", "clip"].includes(getComputedStyle(parent).overflowX)) continue;
      const clip = parent.getBoundingClientRect();
      room = Math.min(room, bounds.left - clip.left, clip.right - bounds.right);
    }
    return room;
  });
}

test("inspector inputs leave room for their full focus ring", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await page.getByRole("tab", { name: "Model", exact: true }).click();
    const budget = page.getByRole("spinbutton", { name: "Quad face budget", exact: true });
    await budget.focus();
    expect(await horizontalFocusRoom(budget)).toBeGreaterThanOrEqual(4);
    const trigger = page.getByRole("button", { name: "Automatic retopology", exact: true });
    const title = (await trigger.locator("span").first().boundingBox())!;
    expect(Math.abs(title.x - (await budget.boundingBox())!.x)).toBeLessThan(1);
    const help = page.getByRole("button", { name: "Help: Automatic retopology", exact: true }).locator("svg");
    for (const expanded of [true, false]) {
      await expect(trigger).toHaveAttribute("aria-expanded", String(expanded));
      const arrow = (await trigger.locator(":scope > svg").boundingBox())!;
      const question = (await help.boundingBox())!;
      expect(Math.abs(arrow.y + arrow.height / 2 - question.y - question.height / 2)).toBeLessThan(1);
      if (expanded) await trigger.click();
    }
  } finally {
    await quit(app);
  }
});

test("projection options escape the inspector clipping boundaries", async () => {
  const dataDir = tempDataDir();
  const { app, page } = await launch(dataDir);
  try {
    const bytes = await app.evaluate(({ nativeImage }) => {
      const pixels = Buffer.alloc(128 * 128 * 4, 255);
      return Array.from(nativeImage.createFromBitmap(pixels, { width: 128, height: 128 }).toPNG());
    });
    const file = path.join(dataDir, "reference.png");
    fs.writeFileSync(file, Buffer.from(bytes));
    await stubOpenDialog(app, file);
    await page.getByRole("button", { name: "Add the Front view", exact: true }).click();
    await expect(page.getByRole("button", { name: "Replace the Front view", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Edit", exact: true }).click();
    const projection = page.getByRole("combobox", { name: "Project reference view", exact: true });
    await projection.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((element) => Boolean(element.closest("aside")))).toBe(false);
    await page.getByRole("option", { name: "Front", exact: true }).click();
    await expect(menu).toBeHidden();
  } finally {
    await quit(app);
  }
});

test("generation and finishing menus stay above panels and inside a short viewport", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await page.setViewportSize({ width: 1440, height: 760 });
    let checked = 0;
    for (const tab of ["Create", "Finish"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      if (tab === "Create") await page.getByRole("tab", { name: "From text", exact: true }).click();
      const sidebarSize = await page.getByRole("complementary", { name: "Your workspace", exact: true }).evaluate((element) => {
        const scroll = element.firstElementChild!;
        const right = scroll.getBoundingClientRect().left + scroll.clientWidth;
        return { width: scroll.clientWidth, content: scroll.scrollWidth, wide: Array.from(scroll.querySelectorAll("*")).filter((child) => child.getBoundingClientRect().right > right).slice(0, 6).map((child) => ({ tag: child.tagName, class: child.className, right: child.getBoundingClientRect().right, text: child.textContent?.slice(0, 50) })) };
      });
      expect(sidebarSize.content, JSON.stringify(sidebarSize)).toBeLessThanOrEqual(sidebarSize.width);
      if (tab === "Finish") {
        for (const section of ["Normals", "Ambient occlusion"]) {
          const trigger = page.getByRole("button", { name: section, exact: true });
          if (await trigger.getAttribute("aria-expanded") === "false") await trigger.click();
        }
      }
      const selects = page.getByRole("combobox");
      for (let index = 0; index < await selects.count(); index++) {
        const select = selects.nth(index);
        if (!await select.isVisible() || !await select.isEnabled()) continue;
        await select.focus();
        await page.keyboard.press("ArrowDown");
        const menu = page.getByRole("listbox");
        if (await menu.count()) {
          await expect(menu).toBeVisible();
          expect(await menu.evaluate((element) => Boolean(element.closest("aside")))).toBe(false);
          const bounds = (await menu.boundingBox())!;
          const controlBounds = await select.boundingBox();
          const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          await page.screenshot({ path: "test-results/select-overflow.png" });
          expect(bounds.y).toBeGreaterThanOrEqual(0);
          expect(bounds.y + bounds.height).toBeLessThanOrEqual(761);
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width, JSON.stringify({ bounds, controlBounds, viewport })).toBeLessThanOrEqual(1441);
          expect(await menu.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(12, box.height / 2)));
          })).toBe(true);
          checked++;
        }
        await page.keyboard.press("Escape");
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);
  } finally {
    await quit(app);
  }
});

test("settings sidebar keeps keyboard focus rings inside its scroll area", async () => {
  const { app, page } = await launch(tempDataDir());
  try {
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const general = page.getByRole("dialog", { name: "Settings", exact: true }).getByRole("tab", { name: "General", exact: true });
    await general.focus();
    expect(await horizontalFocusRoom(general)).toBeGreaterThanOrEqual(4);
  } finally {
    await quit(app);
  }
});
