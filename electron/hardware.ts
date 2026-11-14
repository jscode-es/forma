import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { app } from "electron";
import type { HardwareInfo } from "./contract";
import { getSystemInfo } from "./system";

const run = promisify(execFile);

async function output(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(command, args, { timeout: 8000, windowsHide: true });
    return stdout;
  } catch {
    return null;
  }
}

async function nvidia(): Promise<Pick<HardwareInfo, "gpu" | "vramMb" | "driver" | "cuda">> {
  const query = await output("nvidia-smi", ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"]);
  if (!query) return { gpu: null, vramMb: null, driver: null, cuda: null };
  const [name, memory, driver] = query.split("\n")[0].split(",").map((s) => s.trim());
  const header = await output("nvidia-smi", []);
  return {
    gpu: name || null,
    vramMb: Number(memory) || null,
    driver: driver || null,
    cuda: header?.match(/CUDA (?:UMD )?Version:\s*([\d.]+)/)?.[1] ?? null,
  };
}

const PROBE = "import sys, json; print(json.dumps({'path': sys.executable, 'version': sys.version.split()[0]}))";

async function probePython(command: string, args: string[]) {
  const stdout = await output(command, [...args, "-c", PROBE]);
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout.trim().split("\n").pop()!) as { path: string; version: string };
    return typeof parsed.path === "string" && /^3\.\d+/.test(parsed.version) ? parsed : null;
  } catch {
    return null;
  }
}

export async function findPython(): Promise<HardwareInfo["python"]> {
  const candidates: [string, string[]][] = [];
  if (process.env.FORMA_PYTHON) candidates.push([process.env.FORMA_PYTHON, []]);
  if (process.platform === "win32") candidates.push(["py", ["-3.11"]], ["py", ["-3"]]);
  candidates.push(["python3", []], ["python", []]);
  for (const [command, args] of candidates) {
    const found = await probePython(command, args);
    if (found) return found;
  }
  return null;
}

let cached: Promise<HardwareInfo> | undefined;

export function getHardware(refresh = false): Promise<HardwareInfo> {
  if (refresh || !cached) {
    cached = (async () => {
      const [gpuInfo, python, system] = await Promise.all([nvidia(), findPython(), getSystemInfo()]);
      let diskFreeBytes: number | null = null;
      try {
        const stats = fs.statfsSync(app.getPath("userData"));
        diskFreeBytes = stats.bavail * stats.bsize;
      } catch {
        diskFreeBytes = null;
      }
      return { ...gpuInfo, gpu: gpuInfo.gpu ?? system.gpu, diskFreeBytes, python };
    })();
  }
  return cached;
}
