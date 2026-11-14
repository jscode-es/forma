import { app, shell } from "electron";
import type { SystemInfo } from "./contract";

type GpuDevice = { active?: boolean; deviceString?: string };
type GpuInfo = { gpuDevice?: GpuDevice[]; auxAttributes?: { glRenderer?: string } };

async function detectGpu(): Promise<string | null> {
  try {
    const info = (await app.getGPUInfo("complete")) as GpuInfo;
    const active = info.gpuDevice?.find((d) => d.active && d.deviceString);
    if (active?.deviceString) return active.deviceString;
    const renderer = info.auxAttributes?.glRenderer;
    return renderer?.match(/ANGLE \([^,]+, ([^(]+?) \(/)?.[1] ?? null;
  } catch {
    return null;
  }
}

let cached: Promise<Omit<SystemInfo, "languages">> | undefined;

export async function getSystemInfo(): Promise<SystemInfo> {
  cached ??= detectGpu().then((gpu) => ({
    version: app.getVersion(),
    platform: process.platform,
    gpu,
    dataDir: app.getPath("userData"),
  }));
  return { ...await cached, languages: app.getPreferredSystemLanguages() };
}

export async function openDataDir() {
  const error = await shell.openPath(app.getPath("userData"));
  if (error) throw new Error(error);
}
