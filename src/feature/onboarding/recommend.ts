import type { HardwareInfo, PluginState, WeightsState } from "@/lib/forma";

export type Fit = "installed" | "recommended" | "optional" | "incompatible";
export type FitReason = "cuda" | "vram" | "python" | null;
export type Recommendation = { plugin: PluginState; fit: Fit; reason: FitReason };

const CORE = ["hunyuan3d-2", "sdxl-lightning", "hunyuan3d-2-1-paint"];
const RUNTIME_GB = 6.5;

export function recommend(plugins: PluginState[], hardware: HardwareInfo | null, python: string | null): Recommendation[] {
  const vramGb = hardware?.vramMb ? hardware.vramMb / 1024 : null;
  const fits = plugins.map((plugin): Recommendation => {
    if (plugin.status === "installed") return { plugin, fit: "installed", reason: null };
    if (plugin.requirements.cuda && !hardware?.cuda) return { plugin, fit: "incompatible", reason: "cuda" };
    if (vramGb !== null && vramGb < plugin.requirements.vramGb) return { plugin, fit: "incompatible", reason: "vram" };
    if (!python) return { plugin, fit: "incompatible", reason: "python" };
    return { plugin, fit: CORE.includes(plugin.id) ? "recommended" : "optional", reason: null };
  });
  const order: Fit[] = ["recommended", "optional", "installed", "incompatible"];
  return fits.sort((a, b) => order.indexOf(a.fit) - order.indexOf(b.fit) || CORE.indexOf(a.plugin.id) - CORE.indexOf(b.plugin.id));
}

export function estimateDiskGb(selected: PluginState[], weights: WeightsState[]) {
  const runtimes = new Set(selected.filter((plugin) => plugin.runtime && !plugin.runtime.ready).map((plugin) => plugin.runtime!.id));
  const installed = new Set(weights.filter((entry) => entry.status === "installed").map((entry) => entry.id));
  const pending = new Map(selected.flatMap((plugin) => plugin.weights).filter((entry) => !installed.has(entry.id)).map((entry) => [entry.id, entry.sizeBytes]));
  const own = selected.reduce((total, plugin) => total + (plugin.runtime ? 0.1 : plugin.requirements.diskGb), 0);
  return runtimes.size * RUNTIME_GB + own + [...pending.values()].reduce((total, size) => total + size, 0) / 1024 ** 3;
}
