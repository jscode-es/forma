import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, tempDataDir } from "./helpers";

const dataDir = tempDataDir();
const electronPath = require("electron") as unknown as string;

function cli(...args: string[]) {
  const env: NodeJS.ProcessEnv = { ...process.env, FORMA_USER_DATA: dataDir, FORMA_TEST_ENGINES: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = process.env.FORMA_E2E_EXECUTABLE;
  const result = spawnSync(executable ?? electronPath, executable ? ["--cli", ...args] : [ROOT, "--cli", ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 120_000 });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function png() {
  const file = path.join(dataDir, "reference.png");
  const header = Buffer.from("89504e470d0a1a0a0000000d49484452000000400000004008060000", "hex");
  fs.writeFileSync(file, Buffer.concat([header, Buffer.alloc(32)]));
  return file;
}

test("lists engines, generates, packages and validates from the command line", async () => {
  const engines = cli("engines", "--json");
  expect(engines.code).toBe(0);
  expect(JSON.parse(engines.stdout).map((engine: { id: string }) => engine.id)).toEqual(expect.arrayContaining(["forma-demo", "forma-mesh-tools"]));

  const model = path.join(dataDir, "out", "pyramid.glb");
  const generated = cli("generate", "--engine", "forma-demo", "--image", png(), "--param", "shape=pyramid", "--param", "steps=2", "--out", model, "--json");
  expect(generated.code, generated.stderr).toBe(0);
  expect(fs.readFileSync(model).subarray(0, 4).toString()).toBe("glTF");

  const folder = path.join(dataDir, "out", "package");
  const packaged = cli("package", "--model", model, "--target", "godot", "--out", folder);
  expect(packaged.code, packaged.stderr).toBe(0);
  expect(fs.readdirSync(folder).sort()).toEqual(["README.md", "forma-package.json", "model.glb", "validation.json"]);

  const validated = cli("validate", path.join(folder, "model.glb"));
  expect(validated.code).toBe(0);
  expect(validated.stdout).toContain("0 errors");

  const missing = cli("generate", "--engine", "forma-demo", "--out", model);
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain("--image or --view is required");
});
