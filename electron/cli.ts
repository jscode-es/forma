import fs from "node:fs";
import path from "node:path";
import type { EngineTask, ImageSource, JobInfo, ParameterValue, ReferenceView, SceneModel } from "./contract";
import { listEngines } from "./engines";
import { stageImageFile } from "./images";
import { jobs } from "./jobs";
import { stageModelFile } from "./models";
import { REFERENCE_VIEWS } from "./schemas";
import validator = require("gltf-validator");

const USAGE = `Forma command line

Usage: forma --cli <command> [options]
  (development: npm run cli -- <command> [options])

Commands:
  engines                                   List engines and whether they are ready
  jobs                                      List recent jobs
  generate --engine <id> --image <file> --out <model.glb>
           [--view <front|back|left|right|top>=<file>]... [--param <name>=<value>]...
  text-to-image --engine <id> --prompt <text> --out <folder> [--param <name>=<value>]...
  texture --engine <id> --model <model.glb> --image <file> --out <model.glb> [--param <name>=<value>]...
  package --model <model.glb> [--lod <lod.glb>]... --target <blender|unity|godot> --out <folder> [--no-tangents]
  validate <model.glb>                      Validate with the Khronos glTF Validator

Add --json for machine-readable output. Close the Forma window first: the command line and the app share one job queue.`;

class UsageError extends Error {}

type Args = { command: string; positional: string[]; options: Map<string, string[]>; flags: Set<string> };

const FLAGS = new Set(["--json", "--no-tangents", "--help"]);

function parse(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const token = rest[index];
    if (FLAGS.has(token)) flags.add(token);
    else if (token.startsWith("--")) {
      const value = rest[++index];
      if (value === undefined) throw new UsageError(`${token} needs a value`);
      options.set(token, [...(options.get(token) ?? []), value]);
    } else positional.push(token);
  }
  return { command, positional, options, flags };
}

function one(args: Args, name: string): string {
  const value = args.options.get(name)?.[0];
  if (!value) throw new UsageError(`${name} is required`);
  return value;
}

function file(value: string) {
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new UsageError(`File not found: ${value}`);
  return resolved;
}

function parameters(args: Args): Record<string, ParameterValue> {
  const result: Record<string, ParameterValue> = {};
  for (const pair of args.options.get("--param") ?? []) {
    const match = /^([a-zA-Z][a-zA-Z0-9_]{0,63})=(.*)$/.exec(pair);
    if (!match) throw new UsageError(`Invalid --param ${pair}; use name=value`);
    const [, key, raw] = match;
    result[key] = raw === "true" ? true : raw === "false" ? false : raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
  }
  return result;
}

const print = (args: Args, data: unknown, text: string) => process.stdout.write(`${args.flags.has("--json") ? JSON.stringify(data, null, 2) : text}\n`);

async function wait(id: string, json: boolean): Promise<JobInfo> {
  let last = "";
  for (;;) {
    const job = jobs.info(id);
    const line = `${job.status} ${Math.round(job.progress * 100)}%${job.stage ? ` ${job.stage}` : ""}`;
    if (line !== last && !json) process.stderr.write(`  ${line}\n`);
    last = line;
    if (job.status === "succeeded") return job;
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`${job.task} ${job.status}${job.error ? `: ${job.error}` : ""}\n${jobs.logs(id).split("\n").slice(-8).join("\n")}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function run(args: Args, task: EngineTask, engineId: string, input: { images?: ImageSource[]; views?: ReferenceView[]; models?: SceneModel[]; prompt?: string }, extra: Record<string, ParameterValue> = {}) {
  const job = await jobs.enqueue({
    engineId,
    task,
    projectId: null,
    parameters: { ...parameters(args), ...extra },
    images: input.images ?? [],
    models: input.models ?? [],
    views: input.views ?? [],
    prompt: input.prompt ?? null,
  });
  if (!args.flags.has("--json")) process.stderr.write(`${task} with ${engineId} (job ${job.id})\n`);
  return wait(job.id, args.flags.has("--json"));
}

function copyResults(job: JobInfo, kinds: string[] | null, folder: string) {
  fs.mkdirSync(folder, { recursive: true });
  const written: string[] = [];
  for (const result of job.results.filter((entry) => !kinds || kinds.includes(entry.kind))) {
    const target = path.join(folder, path.basename(result.path));
    fs.copyFileSync(jobs.resultFile(job.id, result.path), target);
    written.push(target);
  }
  return written;
}

function copyModel(job: JobInfo, out: string) {
  const model = job.results.find((entry) => entry.kind === "model");
  if (!model) throw new Error("The job has no model result");
  const target = path.resolve(out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(jobs.resultFile(job.id, model.path), target);
  return target;
}

async function command(args: Args): Promise<number> {
  switch (args.command) {
    case "help":
      process.stdout.write(`${USAGE}\n`);
      return 0;
    case "engines": {
      const engines = (await listEngines()).map(({ info }) => ({ id: info.id, name: info.name, tasks: info.tasks, available: info.available, problem: info.problem }));
      print(args, engines, engines.map((e) => `${e.id.padEnd(24)} ${(e.available ? "ready" : (e.problem ?? "unavailable")).padEnd(18)} ${e.tasks.join(", ")}`).join("\n"));
      return 0;
    }
    case "jobs": {
      const list = jobs.list().slice(0, 20);
      print(args, list, list.map((j) => `${j.createdAt}  ${j.status.padEnd(10)} ${j.task.padEnd(16)} ${j.engineId}`).join("\n"));
      return 0;
    }
    case "generate": {
      const viewPairs = (args.options.get("--view") ?? []).map((pair) => {
        const [view, value] = pair.split(/=(.*)/s);
        if (!REFERENCE_VIEWS.includes(view as ReferenceView) || !value) throw new UsageError(`Invalid --view ${pair}; use front=<file>`);
        return { view: view as ReferenceView, file: file(value) };
      });
      const image = args.options.get("--image")?.[0];
      const sources = viewPairs.length ? viewPairs : image ? [{ view: "front" as ReferenceView, file: file(image) }] : [];
      if (sources.length === 0) throw new UsageError("--image or --view is required");
      const engine = (await listEngines()).find((e) => e.manifest.id === one(args, "--engine"));
      const views = engine?.manifest.inputs.views.length ? sources.map((source) => source.view) : [];
      const job = await run(args, "image-to-3d", one(args, "--engine"), { images: sources.map((source) => stageImageFile(source.file)), views });
      const target = copyModel(job, one(args, "--out"));
      print(args, { job: job.id, file: target }, `Saved ${target}`);
      return 0;
    }
    case "text-to-image": {
      const job = await run(args, "text-to-image", one(args, "--engine"), { prompt: one(args, "--prompt") });
      const files = copyResults(job, ["image"], path.resolve(one(args, "--out")));
      print(args, { job: job.id, files }, files.map((entry) => `Saved ${entry}`).join("\n"));
      return 0;
    }
    case "texture": {
      const model = stageModelFile(file(one(args, "--model")), "Input");
      const job = await run(args, "texture", one(args, "--engine"), { models: [model], images: [stageImageFile(file(one(args, "--image")))] });
      const target = copyModel(job, one(args, "--out"));
      print(args, { job: job.id, file: target }, `Saved ${target}`);
      return 0;
    }
    case "package": {
      const engine = (await listEngines()).find((e) => e.manifest.tasks.includes("export-package"));
      if (!engine) throw new Error("No engine can export packages");
      const models = [one(args, "--model"), ...(args.options.get("--lod") ?? [])].map((value, index) => stageModelFile(file(value), index === 0 ? "Model" : `LOD ${index}`));
      const job = await run(args, "export-package", engine.manifest.id, { models }, { target: one(args, "--target"), tangents: !args.flags.has("--no-tangents") });
      const files = copyResults(job, null, path.resolve(one(args, "--out")));
      print(args, { job: job.id, files }, files.map((entry) => `Saved ${entry}`).join("\n"));
      return 0;
    }
    case "validate": {
      const target = file(args.positional[0] ?? "");
      const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(target)), { uri: path.basename(target), maxIssues: 200 });
      const issues = report.issues;
      const lines = issues.messages.filter((m) => m.severity <= 1).slice(0, 20).map((m) => `  ${m.severity === 0 ? "error" : "warning"} ${m.code} ${m.pointer ?? ""} ${m.message}`);
      print(args, report, [`${path.basename(target)}: ${issues.numErrors} errors, ${issues.numWarnings} warnings, ${issues.numInfos} infos (glTF Validator ${validator.version()})`, ...lines].join("\n"));
      return issues.numErrors > 0 ? 1 : 0;
    }
    default:
      throw new UsageError(`Unknown command: ${args.command}`);
  }
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const args = parse(argv);
    if (args.flags.has("--help")) return command({ ...args, command: "help" });
    return await command(args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (error instanceof UsageError) {
      process.stderr.write("Run forma --cli help for usage.\n");
      return 2;
    }
    return 1;
  }
}
