import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type { EngineInfo, ParameterValue } from "./contract";
import { getHardware } from "./hardware";
import { engineManifest, type EngineManifest } from "./schemas";
import { missingRequiredWeights } from "./weights";
import { getBlender } from "./blender";

export type InstalledEngine = { info: EngineInfo; manifest: EngineManifest; dir: string };

const MANIFEST = "forma-engine.json";

export function builtinEnginesRoot() {
  const root = path.join(app.getAppPath(), "engines");
  return app.isPackaged ? root.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`) : root;
}

export function userEnginesRoot() {
  return path.join(app.getPath("userData"), "engines");
}

function readEngine(dir: string, builtin: boolean): InstalledEngine | null {
  const file = path.join(dir, MANIFEST);
  if (!fs.existsSync(file)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const parsed = engineManifest.safeParse(raw);
  if (!parsed.success) {
    console.warn(`Invalid engine manifest in ${dir}:`, parsed.error.issues);
    return null;
  }
  const manifest = parsed.data;
  return {
    manifest,
    dir,
    info: {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      license: manifest.license,
      description: manifest.description,
      tasks: manifest.tasks,
      parameters: manifest.parameters,
      requirements: { ...manifest.requirements, python: manifest.runtime.type === "python" },
      inputs: manifest.inputs,
      builtin,
      demo: manifest.demo,
      network: manifest.network && builtin,
      available: true,
      problem: null,
    },
  };
}

export async function listEngines(): Promise<InstalledEngine[]> {
  fs.mkdirSync(userEnginesRoot(), { recursive: true });
  const hardware = await getHardware();
  const engines = new Map<string, InstalledEngine>();

  for (const [root, builtin] of [[builtinEnginesRoot(), true], [userEnginesRoot(), false]] as const) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const engine = readEngine(path.join(root, entry.name), builtin);
      if (!engine || engines.has(engine.manifest.id)) continue;

      const { info, manifest, dir } = engine;
      if (!fs.existsSync(path.join(dir, manifest.runtime.entry))) info.problem = "entry-missing";
      else if (manifest.runtime.type === "blender" && !(await getBlender())) info.problem = "blender-missing";
      else if (manifest.runtime.type === "python" && !hardware.python && !fs.existsSync(enginePython(dir) ?? "")) info.problem = "python-missing";
      else if (manifest.requirements.cuda && !hardware.cuda) info.problem = "cuda-missing";
      else if (hardware.vramMb !== null && manifest.requirements.vramGb * 1024 > hardware.vramMb) info.problem = "vram-insufficient";
      else if (missingRequiredWeights(manifest).length > 0) info.problem = "weights-missing";
      info.available = info.problem === null;
      engines.set(manifest.id, engine);
    }
  }
  return [...engines.values()];
}

export function enginePython(dir: string): string | null {
  const candidate = process.platform === "win32" ? path.join(dir, ".venv", "Scripts", "python.exe") : path.join(dir, ".venv", "bin", "python");
  if (fs.existsSync(candidate)) return candidate;
  try {
    const { python } = JSON.parse(fs.readFileSync(path.join(dir, "python.json"), "utf8")) as { python?: unknown };
    return typeof python === "string" && path.isAbsolute(python) && fs.existsSync(python) ? python : null;
  } catch {
    return null;
  }
}

export function resolveParameters(manifest: EngineManifest, values: Record<string, ParameterValue>) {
  const resolved: Record<string, ParameterValue> = {};
  for (const parameter of manifest.parameters) {
    const value = values[parameter.id] ?? parameter.default;
    if (parameter.type === "boolean") {
      if (typeof value !== "boolean") throw new Error(`Parameter ${parameter.id} must be a boolean`);
    } else if (parameter.type === "enum") {
      if (!parameter.options.some((o) => o.value === value)) throw new Error(`Parameter ${parameter.id} has an invalid option`);
    } else {
      if (typeof value !== "number" || value < parameter.min || value > parameter.max) {
        throw new Error(`Parameter ${parameter.id} must be between ${parameter.min} and ${parameter.max}`);
      }
      if (parameter.type === "integer" && !Number.isInteger(value)) throw new Error(`Parameter ${parameter.id} must be an integer`);
    }
    resolved[parameter.id] = value;
  }
  return resolved;
}
