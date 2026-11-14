import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BrowserWindow, dialog, nativeImage } from "electron";
import type { ImageSource, ReferenceImage } from "./contract";
import { getDb } from "./db";
import { projectRoot, stagingRoot } from "./models";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const MIN_SIDE = 64;

type Format = "png" | "jpg" | "webp";

function detect(buffer: Buffer): { format: Format; width: number; height: number } | null {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return { format: "png", width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: "jpg", height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { format: "webp", width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { format: "webp", width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  return null;
}

export function inspectImage(file: string) {
  const { size } = fs.statSync(file);
  if (size > MAX_BYTES) throw new Error("image-too-large");
  const fd = fs.openSync(file, "r");
  const header = Buffer.alloc(Math.min(size, 256 * 1024));
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const info = detect(header);
  if (!info) throw new Error("image-unsupported");
  if (info.width < MIN_SIDE || info.height < MIN_SIDE) throw new Error("image-too-small");
  if (info.width * info.height > MAX_PIXELS) throw new Error("image-too-many-pixels");
  return info;
}

function stagedFile(stagingId: string) {
  return path.join(stagingRoot(), `${stagingId}.image`);
}

export async function importReference(): Promise<ReferenceImage | null> {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options = {
    properties: ["openFile" as const],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
  };
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  const source = result.filePaths[0];
  if (result.canceled || !source) return null;

  const { width, height } = inspectImage(source);
  const stagingId = randomUUID();
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.copyFileSync(source, stagedFile(stagingId));
  return {
    id: randomUUID(),
    view: "front",
    name: path.basename(source, path.extname(source)).slice(0, 120) || "Reference",
    width,
    height,
    original: { type: "staged", stagingId },
    prepared: null,
    usePrepared: false,
    prompt: null,
  };
}

export function stageImageFile(file: string): ImageSource {
  inspectImage(file);
  const stagingId = randomUUID();
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.copyFileSync(file, stagedFile(stagingId));
  return { type: "staged", stagingId };
}

export function stageReferenceBytes(bytes: Uint8Array, pngOnly = true): ImageSource {
  if (bytes.byteLength > MAX_BYTES) throw new Error("image-too-large");
  const data = Buffer.from(bytes);
  const info = detect(data);
  if (!info || (pngOnly && info.format !== "png")) throw new Error("image-unsupported");
  if (info.width < MIN_SIDE || info.height < MIN_SIDE) throw new Error("image-too-small");
  if (info.width * info.height > MAX_PIXELS) throw new Error("image-too-many-pixels");
  if (info.format !== "webp" && nativeImage.createFromBuffer(data).isEmpty()) throw new Error("image-unsupported");
  const stagingId = randomUUID();
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.writeFileSync(stagedFile(stagingId), data);
  return { type: "staged", stagingId };
}

export function importReferenceBytes(bytes: Uint8Array, name: string): ReferenceImage {
  const original = stageReferenceBytes(bytes, false);
  const { width, height } = detect(Buffer.from(bytes))!;
  return {
    id: randomUUID(), view: "front", name: path.basename(name, path.extname(name)).slice(0, 120) || "Reference",
    width, height, original, prepared: null, usePrepared: false, prompt: null,
  };
}

export function imagePath(source: ImageSource, projectId: string | null): string {
  if (source.type === "staged") return stagedFile(source.stagingId);
  if (!projectId) throw new Error("Image not found");
  const row = getDb()
    .prepare("SELECT path FROM assets WHERE id = ? AND project_id = ? AND kind = 'reference'")
    .get(source.assetId, projectId) as { path: string } | undefined;
  if (!row) throw new Error("Image not found");
  const root = projectRoot(projectId);
  const file = path.resolve(root, row.path);
  if (!file.startsWith(root + path.sep)) throw new Error("Invalid asset path");
  return file;
}

export function readReference(source: ImageSource, projectId: string | null): Uint8Array {
  return fs.readFileSync(imagePath(source, projectId));
}

export function imageExtension(file: string): Format {
  const header = Buffer.alloc(64 * 1024);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return detect(header)?.format ?? "png";
}

export function commitImage(projectId: string, source: ImageSource, name: string): ImageSource {
  if (source.type === "asset") {
    imagePath(source, projectId);
    return source;
  }
  const from = stagedFile(source.stagingId);
  const assetId = randomUUID();
  const relative = `references/${assetId}.${imageExtension(from)}`;
  const target = path.join(projectRoot(projectId), relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(from, target);
  const data = fs.readFileSync(target);
  getDb()
    .prepare("INSERT INTO assets (id, project_id, kind, path, sha256, size, name) VALUES (?, ?, 'reference', ?, ?, ?, ?)")
    .run(assetId, projectId, relative, createHash("sha256").update(data).digest("hex"), data.length, name);
  return { type: "asset", assetId };
}
