import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import { BrowserWindow, dialog } from "electron";
import { getDb } from "./db";
import { animationClip } from "./animation-schema";
import type { AnimationClipData, AnimationLibraryItem, ExportResult } from "./contract";

type Row = { id: string; name: string; clip: string; created_at: string; updated_at: string };
const NOW = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";
const item = (row: Row): AnimationLibraryItem => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at });

function row(id: string): Row {
  const value = getDb().prepare("SELECT * FROM animation_clips WHERE id = ?").get(id) as Row | undefined;
  if (!value) throw new Error("animation.clipNotFound");
  return value;
}

export function listAnimations(): AnimationLibraryItem[] {
  return (getDb().prepare("SELECT id, name, created_at, updated_at FROM animation_clips ORDER BY updated_at DESC LIMIT 200").all() as Row[]).map(item);
}

export function readAnimation(id: string): AnimationClipData {
  return animationClip.parse(JSON.parse(row(id).clip));
}

export function saveAnimation(id: string | null, input: AnimationClipData): AnimationLibraryItem {
  const clip = animationClip.parse(input);
  if (id) {
    row(id);
    getDb().prepare(`UPDATE animation_clips SET name = ?, clip = ?, updated_at = ${NOW} WHERE id = ?`).run(clip.name, JSON.stringify(clip), id);
  } else {
    id = randomUUID();
    getDb().prepare("INSERT INTO animation_clips (id, name, clip) VALUES (?, ?, ?)").run(id, clip.name, JSON.stringify(clip));
  }
  return item(row(id));
}

export function deleteAnimation(id: string) {
  row(id);
  getDb().prepare("DELETE FROM animation_clips WHERE id = ?").run(id);
}

export async function importAnimation(): Promise<AnimationLibraryItem | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = { properties: ["openFile" as const], filters: [{ name: "Forma animation", extensions: ["json"] }] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 4 * 1024 * 1024) throw new Error("animation.invalidClip");
  return saveAnimation(null, animationClip.parse(JSON.parse(fs.readFileSync(file, "utf8"))));
}

export async function exportAnimation(id: string): Promise<ExportResult | null> {
  const clip = readAnimation(id);
  const data = Buffer.from(JSON.stringify(clip));
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = { defaultPath: "animation.forma-animation.json", filters: [{ name: "Forma animation", extensions: ["json"] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;
  const sha256 = createHash("sha256").update(data).digest("hex");
  fs.writeFileSync(result.filePath, data);
  if (createHash("sha256").update(fs.readFileSync(result.filePath)).digest("hex") !== sha256) throw new Error("export-verification-failed");
  return { path: result.filePath, size: data.length, sha256 };
}
