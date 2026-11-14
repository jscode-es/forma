import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { Group, Mesh, PlaneGeometry, MeshStandardMaterial, PerspectiveCamera, OrthographicCamera, Raycaster, Vector2, Texture, SRGBColorSpace, RepeatWrapping, NearestFilter } from "three";

const require = createRequire(import.meta.url);
const source = await readFile(new URL("../src/feature/viewport/engine/viewer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/from "(three[^\"]*)"/g, (_, name) => `from "${name === "three" ? import.meta.resolve("three") : pathToFileURL(require.resolve(name)).href}"`);
const { Viewer } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

function material(index) {
  const value = new MeshStandardMaterial();
  value.userData.formaMaterialIndex = index;
  return value;
}

function viewerWith(model) {
  return Object.assign(Object.create(Viewer.prototype), {
    model,
    paint: null,
    paintTextures: new Set(),
    paintMaterials: new Map(),
    paintPointer: null,
    viewMode: "material",
    projection: null,
    pointer: new Vector2(),
    raycaster: new Raycaster(),
    camera: new PerspectiveCamera(40, 1, .01, 100),
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    requestRender() {},
  });
}

test("paint raycast uses UV0, visible closest surfaces, material groups and active camera", () => {
  const selected = material(2);
  const other = material(1);
  const model = new Group();
  const target = new Mesh(new PlaneGeometry(2, 2), selected);
  model.add(target);
  const viewer = viewerWith(model);
  viewer.paint = { materialIndex: 2 };
  viewer.camera.position.z = 3;
  const pointer = { clientX: 50, clientY: 50 };
  assert.deepEqual(viewer.paintHit(pointer), { u: .5, v: .5 });
  const occluder = new Mesh(new PlaneGeometry(2, 2), other);
  occluder.position.z = 1;
  model.add(occluder);
  assert.equal(viewer.paintHit(pointer), null);
  occluder.visible = false;
  assert.ok(viewer.paintHit(pointer));
  occluder.visible = true;
  other.visible = false;
  assert.ok(viewer.paintHit(pointer));
  model.remove(occluder);
  target.material = [other, selected];
  target.geometry.clearGroups();
  target.geometry.addGroup(0, 6, 1);
  assert.ok(viewer.paintHit(pointer));
  target.geometry.clearGroups();
  target.geometry.addGroup(0, 6, 0);
  other.visible = true;
  assert.equal(viewer.paintHit(pointer), null);
  target.material = selected;
  viewer.orthographic = new OrthographicCamera(-1, 1, 1, -1, .01, 100);
  viewer.orthographic.position.z = 3;
  viewer.projection = "front";
  assert.ok(viewer.paintHit(pointer));
  const uvs = target.geometry.getAttribute("uv");
  for (let index = 0; index < uvs.count; index++) uvs.setXY(index, 2, 2);
  assert.equal(viewer.paintHit(pointer), null);
});

test("paint clones shared material, preserves sampler and restores original resources", () => {
  const original = material(2);
  original.map = new Texture();
  original.map.wrapS = RepeatWrapping;
  original.map.magFilter = NearestFilter;
  original.map.offset.set(.1, .2);
  original.map.repeat.set(2, 3);
  original.map.updateMatrix();
  const other = material(1);
  const model = new Group();
  const a = new Mesh(new PlaneGeometry(), [other, original]);
  const b = new Mesh(a.geometry, original);
  model.add(a, b);
  const viewer = viewerWith(model);
  let originalDisposed = false;
  original.addEventListener("dispose", () => { originalDisposed = true; });
  original.map.addEventListener("dispose", () => { originalDisposed = true; });
  const canvas = {};
  viewer.configurePaint({ canvas, materialIndex: 2, enabled: true, onBegin() {}, onMove() {}, onEnd() {} });
  assert.equal(a.material[0], other);
  assert.equal(a.material[1], b.material);
  assert.notEqual(b.material, original);
  const texture = b.material.map;
  assert.equal(texture.image, canvas);
  assert.equal(texture.flipY, false);
  assert.equal(texture.colorSpace, SRGBColorSpace);
  assert.equal(texture.wrapS, RepeatWrapping);
  assert.equal(texture.magFilter, NearestFilter);
  assert.deepEqual(texture.matrix.elements, original.map.matrix.elements);
  assert.notEqual(texture.source, original.map.source);
  assert.equal(b.material.roughness, original.roughness);
  viewer.configurePaint(null);
  assert.equal(a.material[1], original);
  assert.equal(b.material, original);
  assert.equal(originalDisposed, false);
});

test("paint pointer cancellation releases capture and restores projection controls", () => {
  const viewer = viewerWith(new Group());
  let released = null;
  let cancelled = null;
  viewer.renderer.domElement.hasPointerCapture = () => true;
  viewer.renderer.domElement.releasePointerCapture = (pointer) => { released = pointer; };
  viewer.controls = { enabled: false };
  viewer.paint = { onEnd: (cancel) => { cancelled = cancel; } };
  viewer.paintPointer = 7;
  viewer.finishPaint(true);
  assert.equal(cancelled, true);
  assert.equal(released, 7);
  assert.equal(viewer.paintPointer, null);
  assert.equal(viewer.controls.enabled, true);
  viewer.projection = "front";
  viewer.paintPointer = 8;
  viewer.finishPaint();
  assert.equal(cancelled, false);
  assert.equal(viewer.controls.enabled, false);
});
