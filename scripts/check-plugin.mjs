import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
let schemas;
try {
  schemas = require(join(root, "dist-electron", "schemas.js"));
} catch {
  console.error("Build the validators first: npx tsc -p electron (or npm run build)");
  process.exit(1);
}

const args = process.argv.slice(2);
const values = (name) => args.flatMap((arg, index) => (args[index - 1] === name ? [arg] : []));
const option = (name) => values(name)[0] ?? null;
const flags = new Set(["--run", "--python", "--weights", "--image", "--blender", "--task"]);
const dirs = args.filter((arg, index) => !arg.startsWith("--") && !flags.has(args[index - 1]));
const run = args.includes("--run");

if (dirs.length === 0) {
  console.error("Usage: npm run plugin:check -- <plugin dir>... [--run] [--task <task>] [--python <path>] [--weights <id>=<folder>] [--image <png|jpg>] [--blender <path>]");
  process.exit(1);
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const issues = (error) => error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);

function validate(dir) {
  const errors = [];
  const warnings = [];
  const manifestFile = join(dir, "forma-engine.json");
  if (!existsSync(manifestFile)) return { errors: ["forma-engine.json is missing"], warnings, manifest: null };
  const parsed = schemas.engineManifest.safeParse(readJson(manifestFile));
  if (!parsed.success) return { errors: issues(parsed.error).map((issue) => `forma-engine.json ${issue}`), warnings, manifest: null };
  const manifest = parsed.data;

  if (!manifest.description.es) warnings.push("description has no Spanish text");
  for (const parameter of manifest.parameters) if (!parameter.label.es) warnings.push(`parameter ${parameter.id} has no Spanish label`);
  const weightIds = manifest.weights.map((weights) => weights.id);
  if (new Set(weightIds).size !== weightIds.length) errors.push("weights ids must be unique");
  if (!existsSync(join(dir, manifest.runtime.entry))) errors.push(`entry ${manifest.runtime.entry} is missing`);
  const installFile = join(dir, "install.json");
  if (existsSync(installFile)) {
    if (!existsSync(join(dir, "README.md"))) errors.push("README.md is missing");
    const spec = schemas.installSpec.safeParse(readJson(installFile));
    if (!spec.success) errors.push(...issues(spec.error).map((issue) => `install.json ${issue}`));
    else {
      for (const file of spec.data.files) if (!existsSync(join(dir, file))) errors.push(`install.json lists ${file}, which is missing`);
      for (const file of ["forma-engine.json", manifest.runtime.entry, spec.data.requirements, "README.md"]) {
        if (!spec.data.files.includes(file)) errors.push(`install.json files must include ${file}`);
      }
      if (!spec.data.licenseNotice) warnings.push("install.json has no licenseNotice");
      else if (!spec.data.licenseNotice.es) warnings.push("licenseNotice has no Spanish text");
      const requirements = join(dir, spec.data.requirements);
      if (existsSync(requirements)) {
        for (const line of readFileSync(requirements, "utf8").split(/\r?\n/)) {
          const entry = line.trim();
          if (entry && !entry.startsWith("#") && !entry.startsWith("-") && !/==|@\s*(https|file):/.test(entry)) warnings.push(`requirement not pinned: ${entry}`);
        }
      }
    }
  }
  return { errors, warnings, manifest };
}

function samplePng() {
  const size = 256;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - 128) ** 2 + (y - 128) ** 2 < 90 ** 2;
      raw.set(inside ? [230, 90, 60, 255] : [0, 0, 0, 0], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function sampleGlb() {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const json = Buffer.from(JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }],
    bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
  }));
  const padded = Buffer.concat([json, Buffer.alloc(-json.length & 3, 0x20)]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + padded.length + 8 + 36, 8);
  const chunk = (length, type) => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(length, 0);
    buffer.write(type, 4);
    return buffer;
  };
  return Buffer.concat([header, chunk(padded.length, "JSON"), padded, chunk(36, "BIN\0"), positions]);
}

function findPython(dir) {
  const explicit = option("--python");
  if (explicit) return explicit;
  const venv = process.platform === "win32" ? join(dir, ".venv", "Scripts", "python.exe") : join(dir, ".venv", "bin", "python");
  if (existsSync(venv)) return venv;
  for (const [command, prefix] of process.platform === "win32" ? [["py", ["-3"]], ["python", []]] : [["python3", []], ["python", []]]) {
    const probe = spawnSync(command, [...prefix, "-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
    if (probe.status === 0) return probe.stdout.trim();
  }
  throw new Error("Python not found: pass --python <path>");
}

function command(dir, manifest, entry) {
  if (manifest.runtime.type === "node") return [process.execPath, [entry]];
  if (manifest.runtime.type === "blender") {
    const blender = option("--blender") ?? process.env.FORMA_BLENDER;
    if (!blender) throw new Error("Blender runtime: pass --blender <path>");
    return [blender, ["--background", "--factory-startup", "--disable-autoexec", "--python", entry, "--"]];
  }
  return [findPython(dir), [entry]];
}

function checkOutput(file, kind) {
  const data = readFileSync(file);
  if (kind === "model") {
    if (data.length < 20 || data.toString("ascii", 0, 4) !== "glTF" || data.readUInt32LE(4) !== 2) return "is not a GLB 2.0 file";
    if (data.readUInt32LE(8) !== data.length) return "has a wrong GLB length header";
    JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString());
  }
  if (kind === "image" && !(data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || (data[0] === 0xff && data[1] === 0xd8))) return "is not a PNG or JPEG image";
  return null;
}

async function runJob(dir, manifest) {
  const task = option("--task") ?? manifest.tasks[0];
  if (!manifest.tasks.includes(task)) throw new Error(`task ${task} is not declared`);
  const work = mkdtempSync(join(tmpdir(), "forma-plugin-check-"));
  const out = join(work, "out");
  mkdirSync(out);
  const weights = Object.fromEntries(values("--weights").map((pair) => pair.split(/=(.*)/s).slice(0, 2)));
  for (const declared of manifest.weights) {
    if (!declared.optional && !weights[declared.id]) throw new Error(`pass --weights ${declared.id}=<folder> (required weights)`);
  }
  const imageCount = manifest.inputs.images.min || (task === "image-to-3d" || task === "texture" ? 1 : 0);
  const images = Array.from({ length: imageCount }, (_, index) => {
    const file = join(work, `image-${index}.png`);
    writeFileSync(file, option("--image") ? readFileSync(option("--image")) : samplePng());
    return file;
  });
  const models = Array.from({ length: manifest.inputs.models.min }, (_, index) => {
    const file = join(work, `model-${index}.glb`);
    writeFileSync(file, sampleGlb());
    return file;
  });
  const parameters = Object.fromEntries(manifest.parameters.map((parameter) => [parameter.id, parameter.default]));
  const job = {
    jobId: "00000000-0000-4000-8000-000000000001",
    task,
    parameters,
    weights,
    inputs: {
      images,
      models,
      videos: [],
      prompt: task === "text-to-image" || task === "text-to-3d" ? "a red wooden chair" : null,
      views: manifest.inputs.views.slice(0, images.length),
    },
    outputDir: out,
  };
  writeFileSync(join(work, "job.json"), JSON.stringify(job, null, 2));

  const [executable, prefix] = command(dir, manifest, resolve(dir, manifest.runtime.entry));
  const child = spawn(executable, [...prefix, "--job", join(work, "job.json")], {
    cwd: dir,
    env: { ...process.env, FORMA_JOB_DIR: work, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", PYTHONUNBUFFERED: "1", PYTHONNOUSERSITE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const problems = [];
  let result = null;
  let progress = 0;
  let noise = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      noise += 1;
      return;
    }
    const parsed = schemas.engineMessage.safeParse(message);
    if (!parsed.success) return problems.push(`invalid message ${line.slice(0, 120)}: ${issues(parsed.error).join("; ")}`);
    if (parsed.data.type === "progress") progress = parsed.data.value;
    if (parsed.data.type === "error") problems.push(`engine error: ${parsed.data.message}`);
    if (parsed.data.type === "result") result = parsed.data;
  });
  const stderr = [];
  createInterface({ input: child.stderr }).on("line", (line) => stderr.push(line));
  const timer = setTimeout(() => child.kill("SIGKILL"), manifest.timeoutSeconds * 1000);
  const code = await new Promise((done) => child.on("close", done));
  clearTimeout(timer);

  if (code !== 0) problems.push(`exit code ${code}${stderr.length ? `\n      ${stderr.slice(-5).join("\n      ")}` : ""}`);
  if (!result) problems.push("no result message");
  for (const file of result?.files ?? []) {
    const target = resolve(out, file.path);
    if (!target.startsWith(out + sep) || !existsSync(target)) problems.push(`result ${file.path} is missing or outside outputDir`);
    else {
      const wrong = checkOutput(target, file.kind);
      if (wrong) problems.push(`result ${file.path} ${wrong}`);
    }
  }
  rmSync(work, { recursive: true, force: true });
  return { task, problems, files: result?.files ?? [], progress, noise };
}

let failed = false;
for (const dir of dirs.map((entry) => resolve(entry))) {
  const { errors, warnings, manifest } = validate(dir);
  const label = dir.startsWith(root) ? dir.slice(root.length + 1).split(sep).join("/") : dir;
  console.log(`${errors.length ? "FAIL" : "ok  "} ${label}${manifest ? ` (${manifest.id}@${manifest.version})` : ""}`);
  for (const error of errors) console.log(`      error: ${error}`);
  for (const warning of warnings) console.log(`      warn: ${warning}`);
  failed ||= errors.length > 0;
  if (!run || !manifest || errors.length) continue;
  try {
    const job = await runJob(dir, manifest);
    console.log(`${job.problems.length ? "FAIL" : "ok  "} ${label} run ${job.task}: ${job.files.map((file) => `${file.kind}:${file.path}`).join(", ") || "no files"}`);
    for (const problem of job.problems) console.log(`      error: ${problem}`);
    if (job.noise && manifest.runtime.type !== "blender") console.log(`      warn: ${job.noise} stdout lines are not JSON; write logs to stderr or as log messages`);
    failed ||= job.problems.length > 0;
  } catch (error) {
    console.log(`FAIL ${label} run: ${error.message}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
