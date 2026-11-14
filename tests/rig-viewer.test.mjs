import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { Bone, BufferGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, Scene, Skeleton, SkinnedMesh, Uint16BufferAttribute, Vector3 } from "three";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/feature/viewport/engine/viewer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/from "(three[^\"]*)"/g, (_, name) => `from "${name === "three" ? import.meta.resolve("three") : pathToFileURL(require.resolve(name)).href}"`);
const { Viewer, disposeObject } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const modelSource = await readFile(new URL("../src/feature/viewport/engine/models.ts", import.meta.url), "utf8");
const modelCompiled = ts.transpileModule(modelSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/from "(three[^\"]*)"/g, (_, name) => `from "${name === "three" ? import.meta.resolve("three") : pathToFileURL(require.resolve(name)).href}"`);
const { parseGlb } = await import(`data:text/javascript;base64,${Buffer.from(modelCompiled).toString("base64")}`);

function fixture() {
  const model = new Group();
  const parent = new Bone();
  parent.name = "parent";
  parent.userData.formaJointIndex = 1;
  const child = new Bone();
  child.name = "child";
  child.position.y = 1;
  child.userData.formaJointIndex = 0;
  parent.add(child);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, 2, 0, 1, 1, 0], 3));
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], 4));
  geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, .25, .75, 0, 0], 4));
  const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial());
  mesh.add(parent);
  model.add(mesh);
  model.updateMatrixWorld(true);
  mesh.bind(new Skeleton([parent, child]));
  const viewer = Object.assign(Object.create(Viewer.prototype), {
    model, scene: new Scene(), rig: null, rigBones: new Map(), rigWeights: new Map(), rigOverlay: new Group(), rigBounds: null,
    paint: null, paintMaterials: new Map(), paintTextures: new Set(), paintPointer: null, viewMode: "material", requestRender() {},
  });
  viewer.scene.add(model, viewer.rigOverlay);
  return { viewer, mesh, parent, child, geometry, material: mesh.material };
}

const config = (changes = {}) => ({ guides: {}, showGuides: false, showBones: false, showWeights: false, selectedBone: 0, pose: [0, 0, 0], ...changes });

test("rig pose deforms the actual skin and restores rest pose without accumulation", () => {
  const { viewer, mesh, child } = fixture();
  const original = child.quaternion.clone();
  viewer.configureRig(config({ pose: [0, 0, 90] }));
  mesh.skeleton.update();
  const deformed = mesh.applyBoneTransform(1, new Vector3(0, 2, 0));
  assert.ok(deformed.distanceTo(new Vector3(-1, 1, 0)) < 1e-6);
  const posed = child.quaternion.clone();
  viewer.configureRig(config({ pose: [0, 0, 90] }));
  assert.ok(child.quaternion.angleTo(posed) < 1e-6);
  viewer.configureRig(null);
  assert.ok(child.quaternion.angleTo(original) < 1e-6);
  mesh.skeleton.update();
  assert.ok(mesh.applyBoneTransform(1, new Vector3(0, 2, 0)).distanceTo(new Vector3(0, 2, 0)) < 1e-6);
});

test("weight colors map source joint indices through each mesh skeleton and restore resources", () => {
  const { viewer, mesh, geometry, material } = fixture();
  viewer.configureRig(config({ showWeights: true }));
  assert.notEqual(mesh.geometry, geometry);
  assert.notEqual(mesh.material, material);
  const colors = mesh.geometry.getAttribute("color");
  assert.deepEqual([colors.getX(0), colors.getZ(0)], [0, 1]);
  assert.deepEqual([colors.getX(1), colors.getZ(1)], [1, 0]);
  assert.deepEqual([colors.getX(2), colors.getZ(2)], [.75, .25]);
  let disposed = false;
  mesh.geometry.addEventListener("dispose", () => { disposed = true; });
  viewer.configureRig(null);
  assert.equal(mesh.geometry, geometry);
  assert.equal(mesh.material, material);
  assert.equal(geometry.getAttribute("color"), undefined);
  assert.equal(disposed, true);
});

test("metadata preserves source joint order and bone parenting", () => {
  const { viewer } = fixture();
  viewer.model.userData.formaClipNames = ["walk"];
  viewer.model.userData.formaHasSkin = true;
  const metadata = viewer.getRigMetadata();
  assert.deepEqual(metadata.bones.map(({ index, name, parent }) => ({ index, name, parent })), [
    { index: 0, name: "child", parent: 1 }, { index: 1, name: "parent", parent: null },
  ]);
  assert.deepEqual(metadata.clips, ["walk"]);
  assert.equal(metadata.hasSkin, true);
  viewer.configureRig(config({ selectedBone: 1, pose: [0, 0, 90] }));
  assert.deepEqual(viewer.getRigMetadata(), metadata);
});

test("guide overlays use rest bounds during pose changes and remain outside model statistics", () => {
  const { viewer } = fixture();
  const configuration = config({ guides: { hips: [0, .5, 0], spine: [0, 1, 0] }, showGuides: true, showBones: true });
  viewer.configureRig(configuration);
  const initial = viewer.rigOverlay.children.filter((node) => node.isMesh).map((node) => node.position.toArray());
  assert.deepEqual(initial, [[.5, 1, 0], [.5, 2, 0]]);
  viewer.configureRig({ ...configuration, selectedBone: 1, pose: [0, 0, 90] });
  assert.deepEqual(viewer.rigOverlay.children.filter((node) => node.isMesh).map((node) => node.position.toArray()), initial);
  assert.equal(viewer.model.children.length, 1);
  viewer.configureRig(null);
  assert.equal(viewer.rigOverlay.children.length, 0);
});

test("GLB loading associates bones with the source skin joint order", async () => {
  const document = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, skin: 0, children: [1] }, { name: "parent", children: [2] }, { name: "child", translation: [0, 1, 0] }],
    skins: [{ joints: [2, 1] }], meshes: [{ primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    buffers: [{ byteLength: 108 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 48 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 2, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: "VEC4" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC4" }],
  };
  const json = Buffer.from(JSON.stringify(document));
  const jsonSize = Math.ceil(json.length / 4) * 4;
  const bytes = Buffer.alloc(12 + 8 + jsonSize + 8 + 108);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(jsonSize, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  bytes.fill(32, 20, 20 + jsonSize);
  json.copy(bytes, 20);
  const offset = 20 + jsonSize;
  bytes.writeUInt32LE(108, offset);
  bytes.writeUInt32LE(0x004e4942, offset + 4);
  const binary = offset + 8;
  [0, 0, 0, 0, 2, 0, 1, 1, 0].forEach((value, index) => bytes.writeFloatLE(value, binary + index * 4));
  for (let index = 0; index < 3; index++) bytes.writeFloatLE(1, binary + 60 + index * 16);
  const model = await parseGlb(bytes);
  const bones = [];
  model.traverse((node) => { if (node.isBone) bones.push([node.name, node.userData.formaJointIndex]); });
  assert.deepEqual(bones, [["parent", 1], ["child", 0]]);
  assert.equal(model.userData.formaHasSkin, true);
  assert.deepEqual(model.userData.formaClipNames, []);
  disposeObject(model);
});

test("disposing a rigged source releases the skeleton texture", () => {
  const { viewer, mesh } = fixture();
  mesh.skeleton.computeBoneTexture();
  let disposed = false;
  mesh.skeleton.boneTexture.addEventListener("dispose", () => { disposed = true; });
  disposeObject(viewer.model);
  assert.equal(disposed, true);
});

test("weight preview takes priority over paint and restores the paint material", () => {
  const { viewer, mesh, material } = fixture();
  material.userData.formaMaterialIndex = 2;
  viewer.configurePaint({ canvas: {}, materialIndex: 2, enabled: true, onBegin() {}, onMove() {}, onEnd() {} });
  const painted = mesh.material;
  assert.notEqual(painted, material);
  viewer.configureRig(config({ showWeights: true }));
  assert.equal(mesh.material.vertexColors, true);
  assert.notEqual(mesh.material, painted);
  viewer.configureRig(null);
  assert.equal(mesh.material, painted);
  viewer.configurePaint(null);
  assert.equal(mesh.material, material);
});
