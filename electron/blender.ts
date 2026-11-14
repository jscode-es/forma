import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { BrowserWindow, dialog } from "electron";
import type { BlenderInfo } from "./contract";
import { getSetting, setSetting } from "./db";

const run = promisify(execFile);
let cached: Promise<BlenderInfo | null> | null = null;

async function verifyBlender(candidate: string): Promise<BlenderInfo | null> {
  if (!path.isAbsolute(candidate) || candidate.includes("\0") || !/^blender(?:\.exe)?$/i.test(path.basename(candidate))) return null;
  try {
    const executable = fs.realpathSync(candidate);
    if (!fs.statSync(executable).isFile()) return null;
    const { stdout } = await run(executable, ["--version"], { timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true });
    const match = /^Blender (\d+)\.(\d+)(?:\.(\d+))?/m.exec(stdout);
    if (!match || Number(match[1]) < 4) return null;
    return { path: executable, version: match[0].slice("Blender ".length) };
  } catch {
    return null;
  }
}

function installationCandidates() {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    for (const base of [process.env.ProgramW6432, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (!base) continue;
      const foundation = path.join(base, "Blender Foundation");
      try {
        for (const entry of fs.readdirSync(foundation).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))) {
          if (/^Blender /i.test(entry)) candidates.push(path.join(foundation, entry, "blender.exe"));
        }
      } catch {}
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Blender.app/Contents/MacOS/Blender");
  } else {
    candidates.push("/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender");
  }
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (path.isAbsolute(directory)) candidates.push(path.join(directory, process.platform === "win32" ? "blender.exe" : "blender"));
  }
  return candidates;
}

async function discoverBlender(): Promise<BlenderInfo | null> {
  const candidates = [getSetting("blender.path"), process.env.FORMA_BLENDER, ...installationCandidates()];
  for (const candidate of new Set(candidates)) {
    if (!candidate) continue;
    const blender = await verifyBlender(candidate);
    if (blender) return blender;
  }
  return null;
}

export function getBlender(refresh = false): Promise<BlenderInfo | null> {
  if (refresh || !cached) cached = discoverBlender();
  return cached;
}

export async function chooseBlender(): Promise<BlenderInfo | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = { properties: ["openFile" as const], ...(process.platform === "win32" ? { filters: [{ name: "Blender", extensions: ["exe"] }] } : {}) };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const blender = await verifyBlender(result.filePaths[0]);
  if (!blender) throw new Error("blender-invalid");
  setSetting("blender.path", blender.path);
  cached = Promise.resolve(blender);
  return blender;
}
