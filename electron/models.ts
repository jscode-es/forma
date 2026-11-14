import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import type { ExportResult, ModelSource, SceneModel } from "./contract";
import { getDb } from "./db";

const MAX_MODEL_BYTES = 512 * 1024 * 1024;

export function stagingRoot() {
  return path.join(app.getPath("userData"), "staging");
}

export function projectRoot(projectId: string) {
  return path.join(app.getPath("userData"), "projects", projectId);
}

function stagedFile(stagingId: string) {
  return path.join(stagingRoot(), `${stagingId}.glb`);
}

export function clearStaging() {
  fs.rmSync(stagingRoot(), { recursive: true, force: true });
  fs.mkdirSync(stagingRoot(), { recursive: true });
}

function assertGlb(file: string) {
  const { size } = fs.statSync(file);
  if (size > MAX_MODEL_BYTES) throw new Error("The model is larger than 512 MB");
  const header = Buffer.alloc(12);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, header, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString("ascii", 0, 4) !== "glTF" || header.readUInt32LE(4) !== 2) {
    throw new Error("The file is not a glTF 2.0 binary (.glb)");
  }
}

export async function importModel(): Promise<SceneModel | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = { properties: ["openFile" as const], filters: [{ name: "glTF binary", extensions: ["glb"] }] };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const source = result.filePaths[0];
  if (result.canceled || !source) return null;

  assertGlb(source);
  const stagingId = randomUUID();
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.copyFileSync(source, stagedFile(stagingId));
  const name = path.basename(source, path.extname(source)).slice(0, 120) || "Model";
  return { type: "staged", stagingId, name };
}

export function stageModelFile(file: string, name: string): SceneModel {
  assertGlb(file);
  const stagingId = randomUUID();
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.copyFileSync(file, stagedFile(stagingId));
  return { type: "staged", stagingId, name: name.slice(0, 120) || "Model" };
}

export function stageModelBytes(bytes: Uint8Array, name: string): SceneModel {
  const buffer = Buffer.from(bytes);
  if (buffer.length > MAX_MODEL_BYTES) throw new Error("The model is larger than 512 MB");
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) throw new Error("The data is not a glTF 2.0 binary");
  const stagingId = randomUUID();
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.writeFileSync(stagedFile(stagingId), buffer);
  return { type: "staged", stagingId, name: name.slice(0, 120) || "Model" };
}

export function modelPath(source: ModelSource): string {
  if (source.type === "staged") return stagedFile(source.stagingId);
  const row = getDb()
    .prepare("SELECT path FROM assets WHERE id = ? AND project_id = ? AND kind = 'model'")
    .get(source.assetId, source.projectId) as { path: string } | undefined;
  if (!row) throw new Error("Model not found");
  const root = projectRoot(source.projectId);
  const file = path.resolve(root, row.path);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid asset path");
  return file;
}

const sha = (data: Buffer | Uint8Array) => createHash("sha256").update(data).digest("hex");

export async function exportModel(source: ModelSource | null, bytes: Uint8Array | null, name: string): Promise<ExportResult | null> {
  const data = source ? fs.readFileSync(modelPath(source)) : bytes ? Buffer.from(bytes) : null;
  if (!data) throw new Error("Nothing to export");
  if (data.toString("ascii", 0, 4) !== "glTF" || data.readUInt32LE(4) !== 2) throw new Error("The data is not a glTF 2.0 binary");

  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const safeName = name.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 100) || "model";
  const options = { defaultPath: `${safeName}.glb`, filters: [{ name: "glTF binary", extensions: ["glb"] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;

  fs.writeFileSync(result.filePath, data);
  const written = fs.readFileSync(result.filePath);
  const expected = sha(data);
  if (sha(written) !== expected) throw new Error("export-verification-failed");
  return { path: result.filePath, sha256: expected, size: written.length };
}

export function readModel(source: ModelSource): Uint8Array {
  if (source.type === "staged") return fs.readFileSync(stagedFile(source.stagingId));
  const row = getDb()
    .prepare("SELECT path FROM assets WHERE id = ? AND project_id = ? AND kind = 'model'")
    .get(source.assetId, source.projectId) as { path: string } | undefined;
  if (!row) throw new Error("Model not found");
  const root = projectRoot(source.projectId);
  const file = path.resolve(root, row.path);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid asset path");
  return fs.readFileSync(file);
}

export function commitStagedModel(projectId: string, model: Extract<SceneModel, { type: "staged" }>): SceneModel {
  const assetId = randomUUID();
  const relative = path.join("assets", `${assetId}.glb`);
  const target = path.join(projectRoot(projectId), relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(stagedFile(model.stagingId), target);
  const data = fs.readFileSync(target);
  getDb()
    .prepare("INSERT INTO assets (id, project_id, kind, path, sha256, size, name) VALUES (?, ?, 'model', ?, ?, ?, ?)")
    .run(assetId, projectId, relative.split(path.sep).join("/"), createHash("sha256").update(data).digest("hex"), data.length, model.name);
  return { type: "asset", assetId, name: model.name };
}

export function assertProjectAsset(projectId: string, assetId: string) {
  const row = getDb().prepare("SELECT 1 FROM assets WHERE id = ? AND project_id = ?").get(assetId, projectId);
  if (!row) throw new Error("Model not found in this project");
}
