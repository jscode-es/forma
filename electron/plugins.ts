import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { app, BrowserWindow, dialog } from "electron";
import { z } from "zod";
import type { PluginState } from "./contract";
import { setSetting } from "./db";
import { userEnginesRoot } from "./engines";
import { engineManifest, installSpec } from "./schemas";
import { linkRuntime, markRuntime, readRuntime, runtimeReady, type Runtime } from "./runtimes";
import { downloadWeights } from "./weights";


type Plugin = { dir: string; spec: z.infer<typeof installSpec>; manifest: z.infer<typeof engineManifest> };
type Live = { stage: string; progress: number | null; child?: ChildProcess; cancelled: boolean; log: string[] };

const MARKER = ".forma-installed.json";
const runtimeInstalls = new Map<string, Promise<void>>();
const live = new Map<string, Live>();
const failures = new Map<string, string>();

export function pluginsRoot() {
  const root = path.join(app.getAppPath(), "plugins");
  return app.isPackaged ? root.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : root;
}

function readPlugins(): Plugin[] {
  if (!fs.existsSync(pluginsRoot())) return [];
  return fs
    .readdirSync(pluginsRoot(), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => {
      const dir = path.join(pluginsRoot(), e.name);
      try {
        const spec = installSpec.parse(JSON.parse(fs.readFileSync(path.join(dir, "install.json"), "utf8")));
        const manifest = engineManifest.parse(JSON.parse(fs.readFileSync(path.join(dir, "forma-engine.json"), "utf8")));
        return [{ dir, spec, manifest }];
      } catch (error) {
        console.warn(`Invalid plugin ${e.name}:`, error instanceof Error ? error.message : error);
        return [];
      }
    });
}

function target(plugin: Plugin) {
  return path.join(userEnginesRoot(), plugin.manifest.id);
}

function installedVersion(plugin: Plugin): string | null {
  try {
    return (JSON.parse(fs.readFileSync(path.join(target(plugin), MARKER), "utf8")) as { version: string }).version;
  } catch {
    return null;
  }
}

function state(plugin: Plugin): PluginState {
  const current = live.get(plugin.manifest.id);
  const version = installedVersion(plugin);
  const status: PluginState["status"] = current
    ? "installing"
    : version === plugin.manifest.version
      ? "installed"
      : version
        ? "outdated"
        : failures.has(plugin.manifest.id)
          ? "failed"
          : "available";
  return {
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    description: plugin.manifest.description,
    license: plugin.manifest.license,
    licenseNotice: plugin.spec.licenseNotice ?? null,
    weights: plugin.manifest.weights.map((w) => ({ id: w.id, name: w.name, license: w.license })),
    requirements: { ...plugin.manifest.requirements, python: plugin.spec.python, diskGb: plugin.spec.diskGb },
    status,
    stage: current?.stage ?? null,
    progress: current?.progress ?? null,
    error: failures.get(plugin.manifest.id) ?? null,
    log: current?.log.slice(-6) ?? [],
  };
}

function emit(plugin: Plugin) {
  const snapshot = state(plugin);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("plugins:update", snapshot);
}

export function listPlugins(): PluginState[] {
  return readPlugins().map(state);
}

function find(id: string) {
  const plugin = readPlugins().find((p) => p.manifest.id === id);
  if (!plugin) throw new Error("Unknown plugin");
  return plugin;
}

function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  else child.kill("SIGKILL");
}

function run(plugin: Plugin, current: Live, command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    if (current.cancelled) return reject(new Error("cancelled"));
    const child = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    current.child = child;
    const onLine = (line: string) => {
      const text = line.trim();
      if (!text) return;
      current.log = [...current.log.slice(-40), text.slice(0, 200)];
      const collecting = text.match(/^(Collecting|Downloading|Installing collected packages|Successfully installed)/);
      if (collecting) current.stage = `pip:${collecting[1].toLowerCase().replace(/ /g, "-")}`;
      emit(plugin);
    };
    createInterface({ input: child.stdout! }).on("line", onLine);
    createInterface({ input: child.stderr! }).on("line", onLine);
    child.on("error", (error) => reject(new Error(error.message.includes("ENOENT") ? `${path.basename(command)}-missing` : error.message)));
    child.on("close", (code) => {
      current.child = undefined;
      if (current.cancelled) reject(new Error("cancelled"));
      else if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} exited with code ${code}`));
    });
  });
}

async function findPython311(version: string): Promise<string> {
  const candidates: [string, string[]][] =
    process.platform === "win32" ? [["py", [`-${version}`]]] : [[`python${version}`, []], ["python3", []]];
  for (const [command, args] of candidates) {
    const found = await new Promise<string | null>((resolve) => {
      execFile(command, [...args, "-c", "import sys; print(sys.executable); print('%d.%d' % sys.version_info[:2])"], { windowsHide: true, timeout: 10000 }, (error, stdout) => {
        if (error) return resolve(null);
        const [exe, ver] = stdout.trim().split(/\r?\n/);
        resolve(ver === version ? exe : null);
      });
    });
    if (found) return found;
  }
  throw new Error("python-missing");
}

export async function choosePython(): Promise<string | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = {
    properties: ["openFile" as const],
    filters: process.platform === "win32" ? [{ name: "Python", extensions: ["exe"] }] : [],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  return result.canceled ? null : (result.filePaths[0] ?? null);
}

export function startInstall(id: string, existingPython: string | null) {
  find(id);
  if (existingPython && (!path.isAbsolute(existingPython) || !fs.existsSync(existingPython))) throw new Error("python-invalid");
  void installPlugin(id, existingPython);
}

async function installPlugin(id: string, existingPython: string | null) {
  const plugin = find(id);
  if (live.has(id)) return;

  const current: Live = { stage: "preparing", progress: null, cancelled: false, log: [] };
  live.set(id, current);
  failures.delete(id);
  emit(plugin);

  const dir = target(plugin);
  const step = (stage: string) => {
    current.stage = stage;
    emit(plugin);
  };

  try {
    if (plugin.spec.vendor.length > 0) {
      step("checking");
      await run(plugin, current, "git", ["--version"]).catch(() => {
        throw new Error("git-missing");
      });
    }

    step("copying");
    fs.mkdirSync(dir, { recursive: true });
    fs.rmSync(path.join(dir, MARKER), { force: true });
    for (const file of plugin.spec.files) fs.copyFileSync(path.join(plugin.dir, file), path.join(dir, file));

    for (const vendor of plugin.spec.vendor) {
      step("code");
      const vendorDir = path.join(dir, vendor.dir);
      const git = (...args: string[]) => run(plugin, current, "git", ["-c", "core.longpaths=true", ...args]);
      if (!fs.existsSync(path.join(vendorDir, ".git"))) {
        await git("clone", "--filter=blob:none", "--no-checkout", vendor.repo, vendorDir);
      }
      if (vendor.paths) await git("-C", vendorDir, "sparse-checkout", "set", "--", ...vendor.paths);
      await git("-C", vendorDir, "fetch", "--quiet", "origin", vendor.commit);
      await git("-C", vendorDir, "checkout", "--quiet", "--force", vendor.commit);
    }

    let python: string;
    if (existingPython) {
      python = existingPython;
      fs.writeFileSync(path.join(dir, "python.json"), JSON.stringify({ python }, null, 2));
    } else {
      fs.rmSync(path.join(dir, "python.json"), { force: true });
      const runtime = plugin.spec.base ? readRuntime(plugin.spec.base) : null;
      if (runtime && !runtimeReady(runtime)) await ensureRuntime(plugin, current, runtime);
      step("python");
      const venv = path.join(dir, ".venv");
      python = process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
      if (!fs.existsSync(python)) await run(plugin, current, await findPython311(plugin.spec.python), ["-m", "venv", venv]);
      if (runtime) linkRuntime(runtime, venv, plugin.spec.python);
      step("dependencies");
      await run(plugin, current, python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", path.join(dir, plugin.spec.requirements)]);
      for (const build of plugin.spec.build) {
        step("building");
        await run(plugin, current, python, ["-m", "pip", "install", "--disable-pip-version-check", "--no-build-isolation", path.join(dir, build)]);
      }
    }

    if (plugin.spec.check) {
      step("verifying");
      const separator = process.platform === "win32" ? ";" : ":";
      const pythonPath = plugin.spec.vendor.map((v) => path.join(dir, v.dir)).join(separator);
      await run(plugin, current, python, ["-c", plugin.spec.check], { PYTHONPATH: pythonPath });
    }

    fs.writeFileSync(
      path.join(dir, MARKER),
      JSON.stringify({ version: plugin.manifest.version, installedAt: new Date().toISOString(), python }, null, 2),
    );

    const accepted = new Date().toISOString();
    for (const weights of plugin.manifest.weights) setSetting(`license:${weights.id}:${weights.source.revision}`, accepted);
    setSetting(`plugin-license:${plugin.manifest.id}:${plugin.manifest.version}`, accepted);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message !== "cancelled") failures.set(id, message);
  } finally {
    live.delete(id);
    emit(plugin);
  }

  if (installedVersion(plugin) === plugin.manifest.version) {
    for (const weights of plugin.manifest.weights) await downloadWeights(weights.id).catch(() => undefined);
  }
}

function ensureRuntime(plugin: Plugin, current: Live, runtime: Runtime) {
  let pending = runtimeInstalls.get(runtime.id);
  if (!pending) {
    pending = (async () => {
      current.stage = "runtime";
      emit(plugin);
      if (!fs.existsSync(runtime.python)) await run(plugin, current, await findPython311(runtime.spec.python), ["-m", "venv", runtime.venv]);
      await run(plugin, current, runtime.python, ["-m", "pip", "install", "--disable-pip-version-check", "-r", runtime.requirements]);
      markRuntime(runtime);
    })().finally(() => runtimeInstalls.delete(runtime.id));
    runtimeInstalls.set(runtime.id, pending);
  }
  return pending;
}

export function cancelInstall(id: string) {
  const current = live.get(id);
  if (!current) return;
  current.cancelled = true;
  if (current.child) killTree(current.child);
}

export function uninstallPlugin(id: string) {
  const plugin = find(id);
  if (live.has(id)) throw new Error("Installation in progress");
  fs.rmSync(target(plugin), { recursive: true, force: true });
  failures.delete(id);
  emit(plugin);
  return state(plugin);
}
