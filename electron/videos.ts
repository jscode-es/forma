import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserWindow, dialog } from "electron";
import type { VideoSource } from "./contract";
import { stagingRoot } from "./models";

export function videoPath(source: VideoSource) {
  const file = path.join(stagingRoot(), `${source.stagingId}.video`);
  const stats = fs.statSync(file);
  if (!stats.isFile() || stats.size < 12 || stats.size > 250 * 1024 * 1024) throw new Error("animation.invalidVideo");
  const header = Buffer.alloc(12);
  const fd = fs.openSync(file, "r");
  try { fs.readSync(fd, header, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (header.toString("ascii", 4, 8) !== "ftyp" && header.readUInt32BE(0) !== 0x1a45dfa3) throw new Error("animation.invalidVideo");
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(stagingRoot()) + path.sep)) throw new Error("animation.invalidVideo");
  return file;
}

export async function importVideo(): Promise<VideoSource | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = { properties: ["openFile" as const], filters: [{ name: "Video", extensions: ["mp4", "mov", "webm"] }] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  return stageVideoFile(file, path.basename(file));
}

export function stageVideoFile(file: string, name: string): VideoSource {
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 250 * 1024 * 1024) throw new Error("animation.invalidVideo");
  const source = { stagingId: randomUUID(), name: name.slice(0, 120) };
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.copyFileSync(file, path.join(stagingRoot(), `${source.stagingId}.video`));
  try { videoPath(source); } catch (error) { fs.unlinkSync(path.join(stagingRoot(), `${source.stagingId}.video`)); throw error; }
  return source;
}
