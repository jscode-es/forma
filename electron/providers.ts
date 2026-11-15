import { execFile } from "node:child_process";
import type { MotionProvider } from "./contract";

const PROVIDERS = ["codex", "claude", "copilot"] as const;

function version(command: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(command, ["--version"], { timeout: 10000, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout) => {
      const line = stdout.trim().split(/\r?\n/)[0] ?? "";
      resolve(error || !/\d+\.\d+/.test(line) ? null : line.slice(0, 120));
    });
  });
}

export async function motionProviders(): Promise<MotionProvider[]> {
  return Promise.all(PROVIDERS.map(async (id) => {
    const found = await version(id);
    return { id, available: found !== null, version: found };
  }));
}
