import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { app, BrowserWindow } from "electron";
import { z } from "zod";
import type { ImageSource, JobFile, JobInfo, JobRequest, SceneModel } from "./contract";
import { getDb } from "./db";
import { enginePython, listEngines, resolveParameters, type InstalledEngine } from "./engines";
import { findPython } from "./hardware";
import { imageExtension, imagePath, stageImageFile } from "./images";
import { modelPath, stageModelFile, stagingRoot } from "./models";
import { installedWeights } from "./weights";

type Row = {
  id: string;
  engine_id: string;
  kind: string;
  project_id: string | null;
  status: JobInfo["status"];
  progress: number;
  stage: string | null;
  error: string | null;
  params: string;
  intermediates: string;
  results: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
const MAX_LOG_BYTES = 64 * 1024;

const message = z.discriminatedUnion("type", [
  z.object({ type: z.literal("progress"), value: z.number().min(0).max(1), stage: z.string().max(80).optional() }),
  z.object({ type: z.literal("log"), level: z.enum(["debug", "info", "warn", "error"]).default("info"), message: z.string().max(4000) }),
  z.object({ type: z.literal("intermediate"), path: z.string().max(260), label: z.string().max(120), kind: z.string().max(40).default("file") }),
  z.object({
    type: z.literal("result"),
    files: z.array(z.object({ path: z.string().max(260), label: z.string().max(120).default(""), kind: z.string().max(40) })).max(32),
  }),
  z.object({ type: z.literal("error"), message: z.string().max(4000) }),
]);

function jobsRoot() {
  return path.join(app.getPath("userData"), "jobs");
}

function jobDir(id: string) {
  return path.join(jobsRoot(), z.uuid().parse(id));
}

function toInfo(row: Row): JobInfo {
  return {
    id: row.id,
    engineId: row.engine_id,
    task: row.kind as JobInfo["task"],
    projectId: row.project_id,
    status: row.status,
    progress: row.progress,
    stage: row.stage,
    error: row.error,
    parameters: JSON.parse(row.params),
    intermediates: JSON.parse(row.intermediates),
    results: JSON.parse(row.results),
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function getRow(id: string): Row {
  const row = getDb().prepare("SELECT * FROM jobs WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new Error("Job not found");
  return row;
}

function emit(id: string) {
  const info = toInfo(getRow(id));
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("jobs:update", info);
}

function insideOutput(id: string, relative: string) {
  const root = path.join(jobDir(id), "out");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new Error(`Invalid output file: ${relative}`);
  return path.relative(jobDir(id), file).split(path.sep).join("/");
}

function killTree(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function offlineEnv(dir: string): NodeJS.ProcessEnv {
  const blackhole = "http://127.0.0.1:9";
  return {
    ...process.env,
    FORMA_JOB_DIR: dir,
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_DATASETS_OFFLINE: "1",
    HTTP_PROXY: blackhole,
    HTTPS_PROXY: blackhole,
    ALL_PROXY: blackhole,
    http_proxy: blackhole,
    https_proxy: blackhole,
    all_proxy: blackhole,
    NO_PROXY: "",
    no_proxy: "",
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
  };
}

class JobRunner {
  private running: { id: string; child: ChildProcess; cancelled: boolean } | null = null;

  recover() {
    getDb()
      .prepare(`UPDATE jobs SET status = 'failed', error = 'interrupted', finished_at = ${NOW} WHERE status = 'running'`)
      .run();
    this.pump();
  }

  shutdown() {
    if (!this.running) return;
    this.running.cancelled = true;
    killTree(this.running.child);
  }

  list(): JobInfo[] {
    return (getDb().prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50").all() as Row[]).map(toInfo);
  }

  async enqueue(request: JobRequest): Promise<JobInfo> {
    const engine = (await listEngines()).find((e) => e.manifest.id === request.engineId);
    if (!engine) throw new Error("Engine not installed");
    if (!engine.info.available) throw new Error(`Engine unavailable: ${engine.info.problem}`);
    if (!engine.manifest.tasks.includes(request.task)) throw new Error("The engine does not support this task");
    const parameters = resolveParameters(engine.manifest, request.parameters);
    const limits = engine.manifest.inputs.images;
    if (request.images.length < limits.min) throw new Error("reference-required");
    if (request.images.length > limits.max) throw new Error("Too many reference images");
    const sources = request.images.map((image) => imagePath(image, request.projectId));
    const modelLimits = engine.manifest.inputs.models;
    if (request.models.length < modelLimits.min) throw new Error("model-required");
    if (request.models.length > modelLimits.max) throw new Error("Too many models");
    const modelSources = request.models.map((model) => {
      if (model.type === "staged") return modelPath({ type: "staged", stagingId: model.stagingId });
      if (model.type === "asset" && request.projectId) return modelPath({ type: "asset", projectId: request.projectId, assetId: model.assetId });
      throw new Error("model-required");
    });

    const id = randomUUID();
    fs.mkdirSync(path.join(jobDir(id), "out"), { recursive: true });
    fs.mkdirSync(path.join(jobDir(id), "in"), { recursive: true });
    const inputs = sources.map((source, index) => {
      const name = `in/image-${index}.${imageExtension(source)}`;
      fs.copyFileSync(source, path.join(jobDir(id), name));
      return name;
    });
    const models = modelSources.map((source, index) => {
      const name = `in/model-${index}.glb`;
      fs.copyFileSync(source, path.join(jobDir(id), name));
      return name;
    });
    fs.writeFileSync(path.join(jobDir(id), "inputs.json"), JSON.stringify({ images: inputs, models }));
    getDb()
      .prepare("INSERT INTO jobs (id, engine_id, kind, project_id, status, params) VALUES (?, ?, ?, ?, 'queued', ?)")
      .run(id, engine.manifest.id, request.task, request.projectId, JSON.stringify(parameters));
    emit(id);
    this.pump();
    return toInfo(getRow(id));
  }

  cancel(id: string) {
    const row = getRow(id);
    if (row.status === "queued") {
      getDb().prepare(`UPDATE jobs SET status = 'cancelled', finished_at = ${NOW} WHERE id = ?`).run(id);
      emit(id);
    } else if (row.status === "running" && this.running?.id === id) {
      this.running.cancelled = true;
      killTree(this.running.child);
    }
  }

  retry(id: string): Promise<JobInfo> {
    const row = getRow(id);
    const { images: imageFiles, models: modelFiles } = this.inputs(id);
    const images: ImageSource[] = imageFiles.map((file) => stageImageFile(path.join(jobDir(id), file)));
    const models: SceneModel[] = modelFiles.map((file) => stageModelFile(path.join(jobDir(id), file), "Input"));
    return this.enqueue({
      engineId: row.engine_id,
      task: row.kind as JobRequest["task"],
      projectId: null,
      parameters: JSON.parse(row.params),
      images,
      models,
    });
  }

  private inputs(id: string): { images: string[]; models: string[] } {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(jobDir(id), "inputs.json"), "utf8"));
      return { images: parsed.images ?? [], models: parsed.models ?? [] };
    } catch {
      return { images: [], models: [] };
    }
  }

  stageFile(id: string, relative: string): SceneModel {
    const job = toInfo(getRow(id));
    const file = job.results.find((r) => r.path === relative);
    if (job.status !== "succeeded" || !file) throw new Error("File not found");
    return stageModelFile(this.resolveFile(id, file.path), file.label || path.basename(file.path, ".glb"));
  }

  stageImage(id: string): ImageSource {
    const job = toInfo(getRow(id));
    const image = job.results.find((r) => r.kind === "image");
    if (job.status !== "succeeded" || !image) throw new Error("The job has no image result");
    return stageImageFile(this.resolveFile(id, image.path));
  }

  readFile(id: string, relative: string): Uint8Array {
    const file = this.resolveFile(id, relative);
    if (fs.statSync(file).size > 50 * 1024 * 1024) throw new Error("File too large to preview");
    return fs.readFileSync(file);
  }

  private resolveFile(id: string, relative: string) {
    const root = jobDir(id);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) throw new Error("File not found");
    return file;
  }

  logs(id: string): string {
    const file = path.join(jobDir(id), "job.log");
    if (!fs.existsSync(file)) return "";
    const { size } = fs.statSync(file);
    const fd = fs.openSync(file, "r");
    try {
      const length = Math.min(size, MAX_LOG_BYTES);
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, size - length);
      return buffer.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  }

  stageResult(id: string): SceneModel {
    const job = toInfo(getRow(id));
    const model = job.results.find((r) => r.kind === "model");
    if (job.status !== "succeeded" || !model) throw new Error("The job has no model result");
    const source = path.resolve(jobDir(id), model.path);
    if (!source.startsWith(jobDir(id) + path.sep)) throw new Error("Invalid result path");
    const stagingId = randomUUID();
    fs.mkdirSync(stagingRoot(), { recursive: true });
    fs.copyFileSync(source, path.join(stagingRoot(), `${stagingId}.glb`));
    return { type: "staged", stagingId, name: (model.label || path.basename(model.path, ".glb")).slice(0, 120) };
  }

  private pump() {
    if (this.running) return;
    const next = getDb().prepare("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get() as
      | { id: string }
      | undefined;
    if (next) this.start(next.id).catch((error) => this.finish(next.id, "failed", String(error?.message ?? error)));
  }

  private finish(id: string, status: JobInfo["status"], error: string | null) {
    getDb()
      .prepare(`UPDATE jobs SET status = ?, error = ?, finished_at = ${NOW}, progress = CASE WHEN ? = 'succeeded' THEN 1 ELSE progress END WHERE id = ?`)
      .run(status, error, status, id);
    emit(id);
    this.running = null;
    this.pump();
  }

  private async command(engine: InstalledEngine): Promise<{ command: string; args: string[]; env: NodeJS.ProcessEnv }> {
    const entry = path.join(engine.dir, engine.manifest.runtime.entry);
    if (engine.manifest.runtime.type === "node") {
      const nodePath = [path.join(app.getAppPath(), "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
      return { command: process.execPath, args: [entry], env: { ELECTRON_RUN_AS_NODE: "1", NODE_PATH: nodePath } };
    }
    const python = enginePython(engine.dir) ?? (await findPython())?.path;
    if (!python) throw new Error("Python not found");
    return { command: python, args: [entry], env: {} };
  }

  private async start(id: string) {
    const row = getRow(id);
    const engine = (await listEngines()).find((e) => e.manifest.id === row.engine_id);
    if (!engine) throw new Error("Engine not installed");

    const dir = jobDir(id);
    const spec = {
      jobId: id,
      task: row.kind,
      parameters: JSON.parse(row.params),
      weights: installedWeights(engine.manifest),
      inputs: {
        images: this.inputs(id).images.map((file) => path.join(dir, file)),
        models: this.inputs(id).models.map((file) => path.join(dir, file)),
      },
      outputDir: path.join(dir, "out"),
    };
    fs.writeFileSync(path.join(dir, "job.json"), JSON.stringify(spec, null, 2));
    const log = fs.createWriteStream(path.join(dir, "job.log"), { flags: "a" });
    const write = (line: string) => log.write(`${new Date().toISOString()} ${line}\n`);

    const { command, args, env } = await this.command(engine);
    const child = spawn(command, [...args, "--job", path.join(dir, "job.json")], {
      cwd: engine.dir,
      env: { ...offlineEnv(dir), ...env },
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.running = { id, child, cancelled: false };
    getDb().prepare(`UPDATE jobs SET status = 'running', started_at = ${NOW}, progress = 0 WHERE id = ?`).run(id);
    emit(id);
    write(`start ${engine.manifest.id}@${engine.manifest.version}`);

    let error: string | null = null;
    let results: JobFile[] | null = null;
    const intermediates: JobFile[] = [];
    const timer = setTimeout(() => {
      error = "timeout";
      killTree(child);
    }, engine.manifest.timeoutSeconds * 1000);

    createInterface({ input: child.stdout! }).on("line", (line) => {
      let parsed: z.infer<typeof message>;
      try {
        parsed = message.parse(JSON.parse(line));
      } catch {
        write(`stdout ${line}`);
        return;
      }
      try {
        if (parsed.type === "progress") {
          getDb().prepare("UPDATE jobs SET progress = ?, stage = COALESCE(?, stage) WHERE id = ?").run(parsed.value, parsed.stage ?? null, id);
          emit(id);
        } else if (parsed.type === "log") {
          write(`${parsed.level} ${parsed.message}`);
        } else if (parsed.type === "intermediate") {
          intermediates.push({ path: insideOutput(id, parsed.path), label: parsed.label, kind: parsed.kind });
          getDb().prepare("UPDATE jobs SET intermediates = ? WHERE id = ?").run(JSON.stringify(intermediates), id);
          emit(id);
        } else if (parsed.type === "result") {
          results = parsed.files.map((f) => ({ path: insideOutput(id, f.path), label: f.label, kind: f.kind }));
        } else {
          error = parsed.message;
          write(`error ${parsed.message}`);
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        write(`error ${error}`);
      }
    });
    createInterface({ input: child.stderr! }).on("line", (line) => write(`stderr ${line}`));

    child.on("error", (e) => {
      error = e.message;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      write(`exit ${code}`);
      log.end();
      if (this.running?.cancelled) return this.finish(id, "cancelled", null);
      if (code === 0 && results && !error) {
        getDb().prepare("UPDATE jobs SET results = ? WHERE id = ?").run(JSON.stringify(results), id);
        return this.finish(id, "succeeded", null);
      }
      this.finish(id, "failed", error ?? (results ? null : "no-result") ?? `exit-${code}`);
    });
  }
}

export const jobs = new JobRunner();
