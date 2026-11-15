import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";

const definition = z.object({
  name: z.string().min(1).max(120),
  python: z.string().regex(/^3\.\d+$/),
  requirements: z.string().regex(/^[\w.-]+$/),
  licenses: z.string().max(400).optional(),
});

const MARKER = ".forma-runtime.json";

export function bundledRuntimesRoot() {
  const root = path.join(app.getAppPath(), "runtimes");
  return app.isPackaged ? root.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : root;
}

export function sharedRuntimesRoot() {
  return path.join(app.getPath("userData"), "runtimes");
}

export function venvPython(venv: string) {
  return process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
}

export function sitePackages(venv: string, version: string) {
  return process.platform === "win32" ? path.join(venv, "Lib", "site-packages") : path.join(venv, "lib", `python${version}`, "site-packages");
}

export function readRuntime(id: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(id)) throw new Error("runtime-unknown");
  const folder = path.join(bundledRuntimesRoot(), id);
  const spec = definition.parse(JSON.parse(fs.readFileSync(path.join(folder, "runtime.json"), "utf8")));
  const requirements = path.join(folder, spec.requirements);
  const digest = createHash("sha256").update(fs.readFileSync(requirements)).digest("hex");
  const venv = path.join(sharedRuntimesRoot(), id, ".venv");
  return { id, spec, requirements, digest, venv, python: venvPython(venv), site: sitePackages(venv, spec.python) };
}

export type Runtime = ReturnType<typeof readRuntime>;

export function runtimeReady(runtime: Runtime) {
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(runtime.venv, "..", MARKER), "utf8")) as { requirements?: string };
    return marker.requirements === runtime.digest && fs.existsSync(runtime.python);
  } catch {
    return false;
  }
}

export function markRuntime(runtime: Runtime) {
  fs.writeFileSync(path.join(runtime.venv, "..", MARKER), JSON.stringify({ requirements: runtime.digest, installedAt: new Date().toISOString() }, null, 2));
}

export function linkRuntime(runtime: Runtime, pluginVenv: string, version: string) {
  if (version !== runtime.spec.python) throw new Error("runtime-python-mismatch");
  const site = sitePackages(pluginVenv, version);
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(path.join(site, "forma-runtime.pth"), `${runtime.site}\n`);
}
