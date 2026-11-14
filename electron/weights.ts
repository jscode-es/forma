import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app, BrowserWindow } from "electron";
import type { WeightsFile, WeightsState } from "./contract";
import { getSetting, setSetting } from "./db";
import { listEngines } from "./engines";
import type { EngineManifest } from "./schemas";

type Declared = EngineManifest["weights"][number];
type Entry = Declared & { engineId: string; engineName: string; vramGb: number };
type Receipt = { id: string; revision: string; files: WeightsFile[]; downloadedAt: string; verifiedAt: string };

const ALLOWED_HOSTS = [/^huggingface\.co$/, /(^|\.)hf\.co$/, /^cdn-lfs[\w-]*\.huggingface\.co$/, /^raw\.githubusercontent\.com$/];

const runtime = new Map<string, { status: "downloading" | "verifying"; downloadedBytes: number; abort?: AbortController }>();
const errors = new Map<string, string>();
const latest = new Map<string, string>();

export function weightsRoot() {
  return path.join(app.getPath("userData"), "models");
}

function weightsDir(entry: Pick<Entry, "id" | "source">) {
  return path.join(weightsRoot(), entry.id, entry.source.revision);
}

function fileUrl(entry: Entry, file: string) {
  const { type, repo, revision } = entry.source;
  if (type === "mediapipe") return `https://storage.googleapis.com/mediapipe-models/${repo}/float16/${revision}/${file}`;
  return type === "huggingface"
    ? `https://huggingface.co/${repo}/resolve/${revision}/${file}`
    : `https://raw.githubusercontent.com/${repo}/${revision}/${file}`;
}

async function catalog(): Promise<Entry[]> {
  const entries = new Map<string, Entry>();
  for (const engine of await listEngines()) {
    for (const weights of engine.manifest.weights) {
      if (!entries.has(weights.id)) {
        entries.set(weights.id, {
          ...weights,
          engineId: engine.manifest.id,
          engineName: engine.manifest.name,
          vramGb: engine.manifest.requirements.vramGb,
        });
      }
    }
  }
  return [...entries.values()];
}

async function find(id: string): Promise<Entry> {
  const entry = (await catalog()).find((e) => e.id === id);
  if (!entry) throw new Error("Unknown model");
  return entry;
}

function licenseKey(entry: Entry) {
  return `license:${entry.id}:${entry.source.revision}`;
}

function readReceipt(entry: Pick<Entry, "id" | "source">): Receipt | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(weightsDir(entry), "receipt.json"), "utf8")) as Receipt;
  } catch {
    return null;
  }
}

function fileSize(file: string) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

function state(entry: Entry): WeightsState {
  const dir = weightsDir(entry);
  const live = runtime.get(entry.id);
  const sizeBytes = entry.files.reduce((sum, f) => sum + f.size, 0);
  const receipt = readReceipt(entry);
  const complete = entry.files.every((f) => fileSize(path.join(dir, f.path)) === f.size);
  const onDisk = entry.files.reduce(
    (sum, f) => sum + Math.max(fileSize(path.join(dir, f.path)), fileSize(path.join(dir, `${f.path}.part`))),
    0,
  );

  let status: WeightsState["status"];
  if (live) status = live.status;
  else if (errors.get(entry.id) === "corrupt") status = "corrupt";
  else if (receipt?.revision === entry.source.revision && complete) status = "installed";
  else status = onDisk > 0 ? "partial" : "missing";

  return {
    id: entry.id,
    name: entry.name,
    engineId: entry.engineId,
    engineName: entry.engineName,
    optional: entry.optional,
    vramGb: entry.vramGb,
    license: entry.license,
    source: entry.source,
    files: entry.files,
    sizeBytes,
    status,
    downloadedBytes: live?.downloadedBytes ?? onDisk,
    licenseAccepted: getSetting(licenseKey(entry)) !== null,
    error: errors.get(entry.id) ?? null,
    latestRevision: latest.get(entry.id) ?? null,
  };
}

function emit(entry: Entry) {
  const snapshot = state(entry);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("weights:update", snapshot);
}

async function sha256(file: string) {
  const hash = createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

function isInstalled(weights: Declared) {
  const receipt = readReceipt(weights);
  return (
    receipt?.revision === weights.source.revision &&
    weights.files.every((f) => fileSize(path.join(weightsDir(weights), f.path)) === f.size)
  );
}

export function missingRequiredWeights(manifest: EngineManifest): string[] {
  return manifest.weights.filter((w) => !w.optional && !isInstalled(w)).map((w) => w.id);
}

export async function listWeights(): Promise<WeightsState[]> {
  return (await catalog()).map(state);
}

export function installedWeights(manifest: EngineManifest): Record<string, string> {
  return Object.fromEntries(manifest.weights.filter(isInstalled).map((w) => [w.id, weightsDir(w)]));
}

export async function acceptLicense(id: string) {
  const entry = await find(id);
  setSetting(licenseKey(entry), new Date().toISOString());
  emit(entry);
  return state(entry);
}

async function downloadFile(entry: Entry, file: WeightsFile, live: { downloadedBytes: number }, signal: AbortSignal, base: number) {
  const target = path.join(weightsDir(entry), file.path);
  const part = `${target}.part`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fileSize(target) === file.size && (await sha256(target)) === file.sha256) return;

  const offset = fileSize(part);
  const response = await fetch(fileUrl(entry, file.path), {
    headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
    redirect: entry.source.type === "mediapipe" ? "error" : "follow",
    signal,
  });
  const host = new URL(response.url).hostname;
  const allowed = entry.source.type === "mediapipe"
    ? response.url === fileUrl(entry, file.path)
    : ALLOWED_HOSTS.some((pattern) => pattern.test(host));
  if (!allowed) throw new Error(`Download host not allowed: ${host}`);
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const append = response.status === 206 && offset > 0;
  let written = append ? offset : 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      written += chunk.length;
      if (written > file.size) return callback(new Error("The file is larger than declared"));
      live.downloadedBytes = base + written;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as never), counter, fs.createWriteStream(part, { flags: append ? "a" : "w" }));

  if ((await sha256(part)) !== file.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(`Checksum mismatch: ${file.path}`);
  }
  fs.renameSync(part, target);
}

export async function downloadWeights(id: string) {
  const entry = await find(id);
  if (getSetting(licenseKey(entry)) === null) throw new Error("License not accepted");
  if (!runtime.has(id)) void runDownload(entry);
}

async function runDownload(entry: Entry) {
  const id = entry.id;
  const abort = new AbortController();
  const live = { status: "downloading" as const, downloadedBytes: 0, abort };
  runtime.set(id, live);
  errors.delete(id);
  emit(entry);
  const timer = setInterval(() => emit(entry), 500);

  try {
    let base = 0;
    for (const file of entry.files) {
      await downloadFile(entry, file, live, abort.signal, base);
      base += file.size;
    }
    const now = new Date().toISOString();
    const receipt: Receipt = { id, revision: entry.source.revision, files: entry.files, downloadedAt: now, verifiedAt: now };
    fs.writeFileSync(path.join(weightsDir(entry), "receipt.json"), JSON.stringify(receipt, null, 2));
  } catch (error) {
    if (!abort.signal.aborted) errors.set(id, error instanceof Error ? error.message : String(error));
  } finally {
    clearInterval(timer);
    runtime.delete(id);
    emit(entry);
  }
}

export function cancelDownload(id: string) {
  runtime.get(id)?.abort?.abort();
}

export async function verifyWeights(id: string) {
  const entry = await find(id);
  if (runtime.has(id)) return state(entry);
  runtime.set(id, { status: "verifying", downloadedBytes: 0 });
  emit(entry);
  try {
    let valid = true;
    for (const file of entry.files) {
      const target = path.join(weightsDir(entry), file.path);
      if (fileSize(target) !== file.size || (await sha256(target)) !== file.sha256) valid = false;
    }
    const receipt = readReceipt(entry);
    if (valid && receipt) {
      fs.writeFileSync(path.join(weightsDir(entry), "receipt.json"), JSON.stringify({ ...receipt, verifiedAt: new Date().toISOString() }, null, 2));
      errors.delete(id);
    } else if (!valid) {
      errors.set(id, "corrupt");
    }
  } finally {
    runtime.delete(id);
  }
  emit(entry);
  return state(entry);
}

export async function removeWeights(id: string) {
  const entry = await find(id);
  cancelDownload(id);
  fs.rmSync(path.join(weightsRoot(), entry.id), { recursive: true, force: true });
  errors.delete(id);
  emit(entry);
  return state(entry);
}

async function latestRevision(entry: Entry): Promise<string | null> {
  const { type, repo } = entry.source;
  if (type === "mediapipe") return null;
  const url = type === "huggingface" ? `https://huggingface.co/api/models/${repo}` : `https://api.github.com/repos/${repo}/commits/HEAD`;
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "forma-desktop" } });
  if (!response.ok) return null;
  const body = (await response.json()) as { sha?: string };
  return typeof body.sha === "string" ? body.sha : null;
}

export async function checkUpdates(): Promise<WeightsState[]> {
  const entries = await catalog();
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const revision = await latestRevision(entry);
        if (revision) latest.set(entry.id, revision);
      } catch {
        latest.delete(entry.id);
      }
    }),
  );
  return entries.map(state);
}
