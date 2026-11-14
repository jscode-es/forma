const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");
const { tangents, unweld, weld } = require("@gltf-transform/functions");
const validator = require("gltf-validator");
const { generateTangents } = require("mikktspace");

const TARGETS = {
  blender: {
    name: "Blender",
    steps: [
      "Open Blender 4 or later and choose File → Import → glTF 2.0 (.glb/.gltf), then select `model.glb`.",
      "Or open `import_forma.py` in the Scripting workspace and run it: it imports the model and its LODs into a `Forma` collection.",
      "Units are meters with +Y up in glTF; Blender converts them to its +Z up automatically.",
    ],
  },
  unity: {
    name: "Unity",
    steps: [
      "Install glTFast (`com.unity.cloud.gltfast`) from the Package Manager (Unity 2021.3 or later).",
      "Copy this folder into `Assets/`. Each `.glb` is imported as a model prefab.",
      "For levels of detail, add an LOD Group to `model` and assign `lod-1`, `lod-2` and `lod-3` to the following levels.",
      "Units are meters; glTFast converts glTF +Y up to Unity's left-handed axes.",
    ],
  },
  godot: {
    name: "Godot",
    steps: [
      "Copy this folder into your Godot 4 project. `.glb` files are imported automatically as scenes.",
      "Open `model.glb` in the Advanced Import Settings to adjust materials, physics or Godot's own generated LODs.",
      "The `lod-N.glb` files are optional manual levels of detail, for use with visibility ranges.",
      "Units are meters with +Y up, the same convention as Godot.",
    ],
  },
};

const BLENDER_SCRIPT = `import os

import bpy

here = os.path.dirname(os.path.abspath(__file__)) if os.path.isfile(__file__) else os.path.dirname(bpy.path.abspath(bpy.context.space_data.text.filepath))
manifest = os.path.join(here, "forma-package.json")
collection = bpy.data.collections.new("Forma")
bpy.context.scene.collection.children.link(collection)
for name in sorted(file for file in os.listdir(here) if file.endswith(".glb")):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(here, name))
    for obj in set(bpy.data.objects) - before:
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
        if name.startswith("lod-"):
            obj.hide_set(True)
            obj.hide_render = True
print("Forma package imported from", here)
`;

function summarize(report) {
  const issues = report.issues;
  return {
    errors: issues.numErrors,
    warnings: issues.numWarnings,
    infos: issues.numInfos,
    hints: issues.numHints,
    messages: issues.messages
      .filter((message) => message.severity <= 1)
      .slice(0, 20)
      .map((message) => ({ code: message.code, severity: message.severity === 0 ? "error" : "warning", message: message.message, pointer: message.pointer ?? null })),
  };
}

function needsTangents(doc) {
  return doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .some((primitive) => primitive.getMaterial()?.getNormalTexture() && primitive.getAttribute("NORMAL") && !primitive.getAttribute("TANGENT"));
}

async function runPackage(job, io, send, fail) {
  const target = TARGETS[job.parameters.target];
  if (!target) fail("invalid-target");
  const models = job.inputs?.models ?? [];
  if (models.length === 0) fail("model-required");

  const files = [];
  const entries = [];
  const validation = {};
  let tangentsGenerated = false;
  for (const [index, input] of models.entries()) {
    const name = index === 0 ? "model.glb" : `lod-${index}.glb`;
    send({ type: "progress", value: 0.05 + (0.75 * index) / models.length, stage: "packaging" });
    const doc = await io.read(input);
    if (job.parameters.tangents && needsTangents(doc)) {
      await doc.transform(unweld(), tangents({ generateTangents, overwrite: false }), weld());
      tangentsGenerated = true;
      send({ type: "log", level: "info", message: `${name}: MikkTSpace tangents generated` });
    }
    const bytes = await io.writeBinary(doc);
    const report = await validator.validateBytes(new Uint8Array(bytes), { uri: name, maxIssues: 200 });
    const summary = summarize(report);
    validation[name] = summary;
    send({ type: "log", level: summary.errors ? "error" : "info", message: `${name}: ${summary.errors} errors, ${summary.warnings} warnings (glTF Validator ${validator.version()})` });
    if (summary.errors > 0) {
      writeFileSync(join(job.outputDir, "validation.json"), JSON.stringify({ validator: validator.version(), files: validation }, null, 2));
      fail(`gltf-validation-failed: ${name}: ${summary.messages.filter((m) => m.severity === "error").slice(0, 3).map((m) => `${m.code} ${m.pointer ?? ""}`.trim()).join("; ")}`);
    }
    writeFileSync(join(job.outputDir, name), bytes);
    const triangles = doc
      .getRoot()
      .listMeshes()
      .flatMap((mesh) => mesh.listPrimitives())
      .reduce((total, primitive) => total + Math.floor((primitive.getIndices()?.getCount() ?? primitive.getAttribute("POSITION")?.getCount() ?? 0) / 3), 0);
    entries.push({ path: name, size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), triangles });
    files.push({ path: name, label: index === 0 ? "Model" : `LOD ${index}`, kind: index === 0 ? "model" : "lod" });
  }

  send({ type: "progress", value: 0.85, stage: "exporting" });
  const readme = [
    `# Forma export for ${target.name}`,
    "",
    ...target.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## Files",
    "",
    ...entries.map((entry) => `- \`${entry.path}\`: ${entry.triangles} triangles, SHA-256 \`${entry.sha256}\``),
    "",
    `Every GLB passed the Khronos glTF Validator ${validator.version()} without errors; see \`validation.json\`.`,
    tangentsGenerated ? "MikkTSpace tangents were generated for primitives with normal maps." : "",
    "",
  ].join("\n");
  writeFileSync(join(job.outputDir, "README.md"), readme);
  writeFileSync(join(job.outputDir, "validation.json"), JSON.stringify({ validator: validator.version(), files: validation }, null, 2));
  const extra = [
    { path: "README.md", label: "Import instructions", kind: "package-file" },
    { path: "validation.json", label: "glTF validation", kind: "validation-report" },
  ];
  if (job.parameters.target === "blender") {
    writeFileSync(join(job.outputDir, "import_forma.py"), BLENDER_SCRIPT);
    extra.push({ path: "import_forma.py", label: "Blender import script", kind: "package-file" });
  }
  const manifest = {
    format: 1,
    generator: "Forma",
    target: job.parameters.target,
    units: "meters",
    upAxis: "+Y",
    tangentsGenerated,
    validator: validator.version(),
    files: [
      ...entries,
      ...extra.map((file) => {
        const data = readFileSync(join(job.outputDir, file.path));
        return { path: basename(file.path), size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
      }),
    ],
  };
  writeFileSync(join(job.outputDir, "forma-package.json"), JSON.stringify(manifest, null, 2));
  extra.push({ path: "forma-package.json", label: "Package manifest", kind: "package-file" });
  send({ type: "result", files: [...files, ...extra] });
}

module.exports = { runPackage, TARGETS };
