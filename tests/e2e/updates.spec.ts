import { expect, test, type ElectronApplication, type Page } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { launch, quit, tempDataDir } from "./helpers";

test.describe.configure({ mode: "serial" });

const manifest = `version: 99.0.0
files:
  - url: Forma-99.0.0.exe
    sha512: ${"A".repeat(86)}==
    size: 1024
path: Forma-99.0.0.exe
sha512: ${"A".repeat(86)}==
releaseDate: '2026-11-01T00:00:00.000Z'
`;

let server: http.Server;
let app: ElectronApplication;
let page: Page;
const requests: string[] = [];

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    requests.push(pathname);
    if (/\/latest(-mac|-linux)?\.yml$/.test(pathname)) response.end(manifest);
    else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.FORMA_UPDATE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ({ app, page } = await launch(tempDataDir()));
});

test.afterAll(async () => {
  delete process.env.FORMA_UPDATE_URL;
  if (app) await quit(app);
  server?.close();
});

test("finds a newer release and remembers when automatic checks are off", async () => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await dialog.getByRole("tab", { name: "Updates", exact: true }).click();
  await dialog.getByRole("button", { name: "Check now", exact: true }).click();
  await expect(dialog.getByText(/Version 99\.0\.0 is available/)).toBeVisible();
  expect(requests.some((url) => /latest(-mac|-linux)?\.yml$/.test(url))).toBe(true);
  await expect(dialog.getByRole("button", { name: /Download/ })).toBeVisible();

  const toggle = dialog.getByRole("switch", { name: "Check for updates when Forma starts" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect((await page.evaluate(() => window.forma!.updates.state())).enabled).toBe(false);
});
