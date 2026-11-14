import { createHash } from "node:crypto";
import fs from "node:fs";
import { BrowserWindow, dialog } from "electron";
import type { ExportResult } from "./contract";

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_SIDE = 8192;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function saveCapture(bytes: Uint8Array, name: string): Promise<ExportResult | null> {
  const data = Buffer.from(bytes);
  if (data.length > MAX_BYTES) throw new Error("image-too-large");
  if (data.length < 33 || !data.subarray(0, 8).equals(SIGNATURE) || data.toString("ascii", 12, 16) !== "IHDR") throw new Error("image-unsupported");
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) throw new Error("image-too-many-pixels");

  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const fileName = `${name.replace(/[^\w .-]+/g, "_").slice(0, 80) || "comparison"}.png`;
  const options = { defaultPath: fileName, filters: [{ name: "PNG", extensions: ["png"] }] };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return null;

  const sha256 = createHash("sha256").update(data).digest("hex");
  fs.writeFileSync(result.filePath, data);
  if (createHash("sha256").update(fs.readFileSync(result.filePath)).digest("hex") !== sha256) throw new Error("export-verification-failed");
  return { path: result.filePath, sha256, size: data.length };
}
