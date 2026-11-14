const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune, simplify, weld } = require("@gltf-transform/functions");
const { MeshoptSimplifier } = require("meshoptimizer");

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

function fail(message) {
  send({ type: "error", message });
  process.exit(1);
}

function primitives(doc) {
  return doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
}

function inspect(doc) {
  const list = primitives(doc);
  return {
    triangles: list.reduce((n, p) => n + Math.floor((p.getIndices()?.getCount() ?? p.getAttribute("POSITION")?.getCount() ?? 0) / 3), 0),
    uvPrimitives: list.filter((p) => p.getAttribute("TEXCOORD_0")).length,
    primitives: list.length,
    materials: doc.getRoot().listMaterials().length,
    textures: doc.getRoot().listTextures().length,
  };
}

async function reduce(io, input, target) {
  const doc = await io.read(input);
  const before = inspect(doc);
  if (before.triangles > target) {
    await doc.transform(weld());
    let ratio = target / before.triangles;
    for (let attempt = 0; attempt < 6 && inspect(doc).triangles > target; attempt++) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 1 }));
      ratio *= 0.85;
    }
    await doc.transform(prune({ keepAttributes: true, keepLeaves: false }));
  }
  const after = inspect(doc);
  if (after.triangles > target) fail("budget-not-met");
  if (after.uvPrimitives < Math.min(before.uvPrimitives, after.primitives)) fail("uv-lost");
  if (after.materials < before.materials || after.textures < before.textures) fail("materials-lost");
  return { doc, before, after };
}

async function main() {
  const job = JSON.parse(readFileSync(process.argv[process.argv.indexOf("--job") + 1], "utf8"));
  const input = job.inputs?.models?.[0];
  if (!input) fail("model-required");
  const { budget, lod1, lod2, lod3 } = job.parameters;

  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  const source = await io.read(input);
  if (source.getRoot().listSkins().length > 0 || primitives(source).some((p) => p.listTargets().length > 0)) {
    fail("unsupported-rigged");
  }
  const original = inspect(source);
  send({ type: "log", level: "info", message: `input: ${original.triangles} triangles, ${original.materials} materials, ${original.textures} textures` });

  const targets = [
    { name: "optimized.glb", label: `${budget}`, kind: "model", triangles: budget },
    ...[lod1, lod2, lod3]
      .map((triangles, index) => ({ name: `lod-${index + 1}.glb`, label: `LOD ${index + 1} · ${triangles}`, kind: "lod", triangles }))
      .filter((t) => t.triangles > 0),
  ];

  const files = [];
  for (const [index, target] of targets.entries()) {
    send({ type: "progress", value: 0.05 + (0.9 * index) / targets.length, stage: index === 0 ? "optimizing" : "lod" });
    const { doc, after } = await reduce(io, input, target.triangles);
    const file = join(job.outputDir, target.name);
    await io.write(file, doc);
    const check = inspect(await io.read(file));
    if (check.triangles !== after.triangles) fail("verification-failed");
    send({ type: "log", level: "info", message: `${target.name}: ${check.triangles} triangles (budget ${target.triangles}), UV ${check.uvPrimitives}/${check.primitives}, ${check.textures} textures` });
    files.push({ path: target.name, label: target.label, kind: target.kind });
  }
  send({ type: "result", files });
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
