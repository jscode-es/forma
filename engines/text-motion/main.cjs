const { spawn } = require("node:child_process");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { z } = require("zod");

const FPS = 24;
const MAX_KEYS = 256;
const MAX_OUTPUT = 2 * 1024 * 1024;
const TIMEOUT_MS = 180_000;

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
function fail(message) {
  send({ type: "error", message });
  process.exit(1);
}

const invalid = (message) => {
  throw new Error(message);
};

function readGlbJson(file) {
  const data = readFileSync(file);
  if (data.length < 20 || data.toString("ascii", 0, 4) !== "glTF") invalid("invalid-glb");
  return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString("utf8"));
}

const multiply = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
const normalize = (q) => {
  const length = Math.hypot(...q) || 1;
  return q.map((value) => value / length);
};
function rotate([x, y, z], [qx, qy, qz, qw]) {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}
function eulerXYZ([x, y, z]) {
  const [cx, cy, cz] = [x, y, z].map((degrees) => Math.cos((degrees * Math.PI) / 360));
  const [sx, sy, sz] = [x, y, z].map((degrees) => Math.sin((degrees * Math.PI) / 360));
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz + sx * sy * cz, cx * cy * cz - sx * sy * sz];
}

function readRig(file) {
  const gltf = readGlbJson(file);
  const joints = gltf.skins?.[0]?.joints;
  if (!joints?.length) invalid("motion-rig-required");
  const parentOf = new Map();
  (gltf.nodes ?? []).forEach((node, index) => (node.children ?? []).forEach((child) => parentOf.set(child, index)));
  const jointSet = new Set(joints);
  const bones = joints.map((index) => {
    const node = gltf.nodes[index];
    if (!node.name) invalid("motion-rig-required");
    let parent = parentOf.get(index);
    while (parent !== undefined && !jointSet.has(parent)) parent = parentOf.get(parent);
    return {
      name: node.name,
      parent: parent === undefined ? null : gltf.nodes[parent].name,
      translation: node.translation ?? [0, 0, 0],
      rotation: normalize(node.rotation ?? [0, 0, 0, 1]),
      scale: node.scale ?? [1, 1, 1],
    };
  });
  const world = new Map();
  const resolve = (bone) => {
    if (world.has(bone.name)) return world.get(bone.name);
    const parent = bone.parent ? resolve(bones.find((entry) => entry.name === bone.parent)) : { rotation: [0, 0, 0, 1], position: [0, 0, 0] };
    const offset = rotate(bone.translation, parent.rotation);
    const value = { rotation: multiply(parent.rotation, bone.rotation), position: parent.position.map((v, i) => v + offset[i]) };
    world.set(bone.name, value);
    return value;
  };
  bones.forEach(resolve);
  return { bones, world };
}

const round = (vector) => `(${vector.map((value) => (Math.abs(value) < 0.05 ? 0 : Math.round(value * 10) / 10)).join(", ")})`;

function buildPrompt(description, rig, durationFrames) {
  const lines = rig.bones.map((bone) => {
    const { rotation, position } = rig.world.get(bone.name);
    const child = rig.bones.find((entry) => entry.parent === bone.name);
    const direction = child ? rig.world.get(child.name).position.map((value, index) => value - position[index]) : null;
    const length = direction ? Math.hypot(...direction) || 1 : 1;
    return `- ${bone.name} (parent ${bone.parent ?? "none"}): local X→${round(rotate([1, 0, 0], rotation))}, Y→${round(rotate([0, 1, 0], rotation))}, Z→${round(rotate([0, 0, 1], rotation))}${direction ? `, points to ${round(direction.map((value) => value / length))}` : ""}`;
  });
  return [
    "You animate a humanoid skeleton for Forma, a local 3D studio. Reply only with the JSON object required by the schema. Do not write code or use tools.",
    "",
    `Motion to create: ${description}`,
    "",
    `Duration: ${durationFrames} frames at ${FPS} FPS (frames 0 to ${durationFrames}).`,
    "World axes: +Y up, +Z front of the character, the character's right side is -X.",
    "Each key rotates one bone relative to its rest pose: rotation = rest * EulerXYZ(x, y, z) in degrees, applied on the bone's local axes listed below.",
    "Bones without keys stay in their rest pose. Use at most 256 keys, frames as integers, angles between -180 and 180. Start each animated bone at frame 0 and make cyclic motions end where they began.",
    "",
    "Bones with the world direction of their local axes in the rest pose:",
    ...lines,
  ].join("\n");
}

function planSchema(rig, durationFrames) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "keys"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 80 },
      keys: {
        type: "array",
        minItems: 1,
        maxItems: MAX_KEYS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["bone", "frame", "rotation"],
          properties: {
            bone: { type: "string", enum: rig.bones.map((bone) => bone.name) },
            frame: { type: "integer", minimum: 0, maximum: durationFrames },
            rotation: { type: "array", minItems: 3, maxItems: 3, items: { type: "number", minimum: -180, maximum: 180 } },
          },
        },
      },
    },
  };
}

function validatePlan(raw, rig, durationFrames) {
  const names = rig.bones.map((bone) => bone.name);
  const plan = z
    .object({
      name: z.string().trim().min(1).max(80),
      keys: z
        .array(
          z
            .object({
              bone: z.string().refine((name) => names.includes(name), "unknown bone"),
              frame: z.number().int().min(0).max(durationFrames),
              rotation: z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-180).max(180), z.number().finite().min(-180).max(180)]),
            })
            .strict(),
        )
        .min(1)
        .max(MAX_KEYS),
    })
    .strict()
    .safeParse(raw);
  if (!plan.success) invalid(`motion-plan-invalid: ${plan.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  const seen = new Set();
  for (const key of plan.data.keys) {
    const id = `${key.bone}:${key.frame}`;
    if (seen.has(id)) invalid(`motion-plan-invalid: duplicate key ${id}`);
    seen.add(id);
  }
  return plan.data;
}

function toClip(plan, rig, durationFrames) {
  const tracks = [];
  for (const bone of rig.bones) {
    const keys = plan.keys.filter((key) => key.bone === bone.name).sort((a, b) => a.frame - b.frame);
    if (!keys.length) continue;
    if (keys[0].frame > 0) keys.unshift({ bone: bone.name, frame: 0, rotation: [0, 0, 0] });
    tracks.push({
      bone: bone.name,
      path: "rotation",
      interpolation: "LINEAR",
      keys: keys.map((key) => ({ frame: key.frame, value: normalize(multiply(bone.rotation, eulerXYZ(key.rotation))) })),
    });
  }
  return { version: 1, name: plan.name, fps: FPS, durationFrames, bones: rig.bones, tracks };
}

function runProvider(provider, prompt, schema, folder) {
  const schemaFile = join(folder, "schema.json");
  const answerFile = join(folder, "answer.json");
  writeFileSync(schemaFile, JSON.stringify(schema));
  const commands = {
    codex: ["codex", ["exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--output-schema", schemaFile, "--output-last-message", answerFile, "-"], true],
    claude: ["claude", ["-p", "--output-format", "json", "--json-schema", JSON.stringify(schema), "--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--no-session-persistence"], true],
    copilot: ["copilot", ["-p", prompt, "-s", "--no-ask-user", "--deny-tool=shell,write,read,url,memory"], false],
  };
  const [command, args, stdin] = commands[provider];
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: folder, shell: false, windowsHide: true, stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"] });
    let output = "";
    let size = 0;
    const collect = (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) child.kill();
      else output += chunk.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", (chunk) => (size += chunk.length));
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.on("error", (error) => fail(error.code === "ENOENT" ? `motion-provider-missing: ${provider}` : error.message));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) fail(`motion-provider-failed: ${provider} exited with code ${code}`);
      resolve({ output, answerFile });
    });
    if (stdin) child.stdin.end(prompt);
  });
}

function extractPlan(provider, output, answerFile) {
  if (provider === "codex") return JSON.parse(readFileSync(answerFile, "utf8"));
  if (provider === "claude") {
    const result = JSON.parse(output);
    if (result.is_error) invalid("motion-provider-failed: claude returned an error");
    return result.structured_output ?? JSON.parse(result.result);
  }
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end < start) invalid("motion-plan-invalid: no JSON object in the answer");
  return JSON.parse(output.slice(start, end + 1));
}

async function main() {
  const job = JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
  const { provider, seconds, consent } = job.parameters;
  if (consent !== true) fail("motion-consent-required");
  if (!["codex", "claude", "copilot"].includes(provider)) fail("motion-provider-unknown");
  const description = (job.inputs?.prompt ?? "").trim();
  if (!description) fail("prompt-required");
  const model = job.inputs?.models?.[0];
  if (!model) fail("model-required");

  send({ type: "progress", value: 0.05, stage: "preparing" });
  const rig = readRig(model);
  const durationFrames = Math.round(seconds * FPS);
  const folder = join(job.outputDir, "provider");
  mkdirSync(folder, { recursive: true });
  const prompt = buildPrompt(description, rig, durationFrames);
  send({ type: "log", level: "info", message: `${provider}: ${rig.bones.length} bones, ${durationFrames} frames` });
  send({ type: "progress", value: 0.15, stage: "planning" });

  const { output, answerFile } = await runProvider(provider, prompt, planSchema(rig, durationFrames), folder);
  let raw;
  try {
    raw = extractPlan(provider, output, answerFile);
  } catch (error) {
    fail(`motion-plan-invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const plan = validatePlan(raw, rig, durationFrames);
  send({ type: "progress", value: 0.85, stage: "exporting" });
  writeFileSync(join(job.outputDir, "plan.json"), JSON.stringify({ contract: "forma-text-motion-v1", provider, description, seconds, plan }, null, 2));
  send({ type: "intermediate", path: "plan.json", label: "Motion plan", kind: "json" });
  const clip = toClip(plan, rig, durationFrames);
  writeFileSync(join(job.outputDir, "clip.json"), JSON.stringify(clip));
  send({ type: "log", level: "info", message: `${plan.name}: ${plan.keys.length} keys on ${clip.tracks.length} bones` });
  send({ type: "result", files: [{ path: "clip.json", label: plan.name, kind: "animation-clip", meta: { provider, seconds } }] });
}

if (require.main === module) main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

module.exports = { readRig, buildPrompt, planSchema, validatePlan, toClip, eulerXYZ };
