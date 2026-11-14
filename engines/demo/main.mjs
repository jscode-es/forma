import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SHAPES = {
  crystal: {
    vertices: [[0, 1, 0], [0.35, 0.5, 0], [0, 0.5, 0.35], [-0.35, 0.5, 0], [0, 0.5, -0.35], [0, 0, 0]],
    faces: [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4], [5, 1, 2], [5, 2, 3], [5, 3, 4], [5, 4, 1]],
  },
  pyramid: {
    vertices: [[0, 1, 0], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.5, 0, -0.5], [0.5, 0, -0.5]],
    faces: [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4], [1, 2, 3], [1, 3, 4]],
  },
};

function buildGlb({ vertices, faces }) {
  const positions = [];
  const normals = [];
  for (const [a, b, c] of faces) {
    const [p, q, r] = [vertices[a], vertices[b], vertices[c]];
    const u = q.map((v, i) => v - p[i]);
    const v = r.map((w, i) => w - p[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1;
    for (const point of [p, q, r]) {
      positions.push(...point);
      normals.push(...n.map((x) => x / length));
    }
  }
  const bin = Buffer.alloc((positions.length + normals.length) * 4);
  [...positions, ...normals].forEach((value, i) => bin.writeFloatLE(value, i * 4));
  const count = positions.length / 3;
  const axis = (i, pick) => pick(...Array.from({ length: count }, (_, k) => positions[k * 3 + i]));

  const json = {
    asset: { version: "2.0", generator: "forma-demo" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Demo" }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.55, 0.36, 0.96, 1], metallicFactor: 0.1, roughnessFactor: 0.4 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length * 4 },
      { buffer: 0, byteOffset: positions.length * 4, byteLength: normals.length * 4 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: "VEC3", min: [0, 1, 2].map((i) => axis(i, Math.min)), max: [0, 1, 2].map((i) => axis(i, Math.max)) },
      { bufferView: 1, componentType: 5126, count, type: "VEC3" },
    ],
  };

  const pad = (buffer, fill) => Buffer.concat([buffer, Buffer.alloc((4 - (buffer.length % 4)) % 4, fill)]);
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.write(type, 4);
    return h;
  };
  return Buffer.concat([header, chunkHeader(jsonChunk.length, "JSON"), jsonChunk, chunkHeader(binChunk.length, "BIN\0"), binChunk]);
}

const job = JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
const { steps, shape, fail } = job.parameters;

send({ type: "log", level: "info", message: `demo job ${job.jobId}: ${steps} steps, ${shape}` });
send({ type: "progress", value: 0, stage: "preparing" });
await sleep(300);

writeFileSync(join(job.outputDir, "parameters.json"), JSON.stringify(job.parameters, null, 2));
send({ type: "intermediate", path: "parameters.json", label: "Parameters", kind: "json" });

for (let step = 1; step <= steps; step++) {
  await sleep(100);
  send({ type: "progress", value: 0.1 + (0.8 * step) / steps, stage: "sampling" });
  if (fail && step === Math.ceil(steps / 2)) {
    send({ type: "error", message: "Simulated failure requested by the user" });
    process.exit(1);
  }
}

send({ type: "progress", value: 0.95, stage: "exporting" });
writeFileSync(join(job.outputDir, "model.glb"), buildGlb(SHAPES[shape]));
send({ type: "result", files: [{ path: "model.glb", label: shape === "pyramid" ? "Pyramid" : "Crystal", kind: "model" }] });
