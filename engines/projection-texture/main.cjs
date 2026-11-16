const Module = require("node:module");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

Module._resolveFilename = ((resolve) => function (request, ...rest) {
  if (request === "sharp") return join(__dirname, "..", "mesh-tools", "sharp-stub.cjs");
  return resolve.call(this, request, ...rest);
})(Module._resolveFilename);

const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune } = require("@gltf-transform/functions");
const { MeshoptDecoder } = require("meshoptimizer");
const { encode } = require("fast-png");
const { decodeImage, weld, unwrap, prepareView, bake } = require("./projection.cjs");

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const TRIANGLES = 4;
const PADDING = 3;

function transform(matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ];
}

function collect(doc) {
  const owners = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (owners.has(mesh)) throw new Error("instanced-mesh-unsupported");
    owners.set(mesh, node);
  }
  const parts = [];
  let vertices = 0, corners = 0;
  for (const [mesh, node] of owners) {
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== TRIANGLES) throw new Error("unsupported-primitive");
      if (primitive.listTargets().length) throw new Error("unsupported-rigged");
      const position = primitive.getAttribute("POSITION");
      const count = position.getCount();
      const indices = primitive.getIndices()?.getArray() ?? Uint32Array.from({ length: count }, (_, i) => i);
      parts.push({ primitive, matrix, position, indices, vertexOffset: vertices, cornerOffset: corners });
      vertices += count;
      corners += indices.length - (indices.length % 3);
    }
  }
  if (!corners) throw new Error("mesh-required");
  const positions = new Float32Array(vertices * 3);
  const triangles = new Uint32Array(corners);
  const element = [];
  for (const part of parts) {
    for (let i = 0; i < part.position.getCount(); i++) {
      const [x, y, z] = part.position.getElement(i, element);
      positions.set(transform(part.matrix, x, y, z), (part.vertexOffset + i) * 3);
    }
    const usable = part.indices.length - (part.indices.length % 3);
    for (let i = 0; i < usable; i++) triangles[part.cornerOffset + i] = part.vertexOffset + part.indices[i];
    part.corners = usable;
  }
  return { parts, positions, triangles };
}

function existingUvs(parts) {
  const materials = new Set(parts.map((part) => part.primitive.getMaterial()).filter(Boolean));
  if (materials.size > 1) return null;
  const cornerUv = new Float32Array(parts.reduce((sum, part) => sum + part.corners, 0) * 2);
  const element = [];
  for (const part of parts) {
    const uv = part.primitive.getAttribute("TEXCOORD_0");
    if (!uv) return null;
    for (let i = 0; i < part.corners; i++) {
      const [u, v] = uv.getElement(part.indices[i], element);
      if (!(u >= -1e-4 && u <= 1.0001 && v >= -1e-4 && v <= 1.0001)) return null;
      cornerUv.set([u, v], (part.cornerOffset + i) * 2);
    }
  }
  return cornerUv;
}

function splitVertices(doc, parts, cornerUv, faceChart) {
  for (const part of parts) {
    const { primitive } = part;
    const firstFace = part.cornerOffset / 3;
    const remap = new Map();
    const sources = [];
    const indices = new Uint32Array(part.corners);
    for (let i = 0; i < part.corners; i++) {
      const original = part.indices[i];
      const key = faceChart[firstFace + Math.floor(i / 3)] * part.position.getCount() + original;
      let index = remap.get(key);
      if (index === undefined) {
        index = sources.length;
        remap.set(key, index);
        sources.push([original, part.cornerOffset + i]);
      }
      indices[i] = index;
    }
    for (const semantic of primitive.listSemantics()) {
      const accessor = primitive.getAttribute(semantic);
      if (semantic === "TEXCOORD_0" || semantic === "COLOR_0") { primitive.setAttribute(semantic, null); continue; }
      const array = accessor.getArray();
      const size = accessor.getElementSize();
      const next = new array.constructor(sources.length * size);
      sources.forEach(([original], index) => next.set(array.subarray(original * size, original * size + size), index * size));
      primitive.setAttribute(semantic, doc.createAccessor().setType(accessor.getType()).setNormalized(accessor.getNormalized()).setArray(next).setBuffer(accessor.getBuffer()));
    }
    const uv = new Float32Array(sources.length * 2);
    sources.forEach(([, corner], index) => uv.set(cornerUv.subarray(corner * 2, corner * 2 + 2), index * 2));
    const buffer = doc.getRoot().listBuffers()[0];
    primitive.setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(buffer));
    const compact = sources.length < 65536 ? Uint16Array.from(indices) : indices;
    primitive.setIndices(doc.createAccessor().setType("SCALAR").setArray(compact).setBuffer(buffer));
  }
}

function applyTexture(doc, parts, png, regenerated) {
  const texture = doc.createTexture("Forma projection").setImage(png).setMimeType("image/png").setExtras({ formaMapSources: { albedo: "projected" } });
  let fallback = null;
  const materials = new Set();
  for (const { primitive } of parts) {
    let material = primitive.getMaterial();
    if (!material) {
      fallback ??= doc.createMaterial("Forma projection").setMetallicFactor(0).setRoughnessFactor(0.8);
      material = fallback;
      primitive.setMaterial(material);
    }
    if (primitive.getAttribute("COLOR_0")) primitive.setAttribute("COLOR_0", null);
    materials.add(material);
  }
  for (const material of materials) {
    material.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(texture);
    if (regenerated) material.setNormalTexture(null).setOcclusionTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null);
  }
}

async function main() {
  const job = JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
  const input = job.inputs?.models?.[0];
  const images = job.inputs?.images ?? [];
  const views = job.inputs?.views ?? [];
  if (!input) throw new Error("model-required");
  if (!images.length) throw new Error("reference-required");
  if (views.length !== images.length) throw new Error("views-mismatch");
  const resolution = Number(job.parameters?.atlasResolution ?? "2048");
  if (![1024, 2048].includes(resolution)) throw new Error("invalid-resolution");
  const sharpness = job.parameters?.blendSharpness ?? 4;
  if (!Number.isInteger(sharpness) || sharpness < 1 || sharpness > 16) throw new Error("invalid-sharpness");

  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  send({ type: "progress", value: 0.05, stage: "loading" });
  const doc = await io.read(input);
  if (!doc.getRoot().listBuffers().length) doc.createBuffer();
  const { parts, positions, triangles } = collect(doc);
  const mesh = weld(positions);

  let cornerUv = existingUvs(parts);
  const regenerated = !cornerUv;
  let charts = 0;
  if (regenerated) {
    send({ type: "progress", value: 0.15, stage: "unwrapping" });
    const atlas = unwrap(mesh, triangles, resolution, PADDING);
    cornerUv = atlas.cornerUv;
    charts = atlas.charts;
    splitVertices(doc, parts, cornerUv, atlas.faceChart);
  }

  send({ type: "progress", value: 0.3, stage: "rendering-geometry" });
  const prepared = images.map((path, index) => prepareView(views[index], decodeImage(readFileSync(path)), mesh, triangles));
  send({ type: "log", level: "info", message: `silhouette fit (IoU): ${prepared.map((view) => `${view.name} ${view.initialIou.toFixed(3)} -> ${view.iou.toFixed(3)}`).join(", ")}` });
  send({ type: "progress", value: 0.4, stage: "baking" });
  const { pixels, coverage } = bake({ mesh, triangles, cornerUv, views: prepared, resolution, sharpness, progress: (value) => send({ type: "progress", value: 0.4 + value * 0.5, stage: "baking" }) });

  send({ type: "progress", value: 0.92, stage: "exporting" });
  const png = encode({ width: resolution, height: resolution, data: pixels, channels: 4, depth: 8 });
  writeFileSync(join(job.outputDir, "albedo.png"), png);
  applyTexture(doc, parts, png, regenerated);
  await doc.transform(prune({ keepAttributes: true, keepLeaves: false }));
  await io.write(join(job.outputDir, "model.glb"), doc);
  send({ type: "log", level: "info", message: `views: ${views.join(", ")}; UVs ${regenerated ? `generated (${charts} charts)` : "kept"}; projected coverage ${(coverage * 100).toFixed(1)}%; exposure gains ${prepared.map((view) => `${view.name} ${view.gain.map((g) => g.toFixed(2)).join("/")}`).join(", ")}` });
  send({ type: "result", files: [
    { path: "model.glb", label: "Projected texture", kind: "model" },
    { path: "albedo.png", label: "Albedo", kind: "image" },
  ] });
}

main().catch((error) => {
  send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
