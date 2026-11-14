import assert from "node:assert/strict";
import test from "node:test";
import { editMaterials, inspectMaterials, normalizeNormalPixels, upscaleDimensions } from "./operations.ts";

function fixture(document) {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const size = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(28 + size + 4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + size);
  bytes.set(json, 20);
  view.setUint32(20 + size, 4, true);
  view.setUint32(24 + size, 0x004e4942, true);
  bytes.set([1, 2, 3, 4], 28 + size);
  return bytes;
}

const source = { asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], materials: [{ name: "Original", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], skins: [{ joints: [0] }], animations: [{ channels: [], samplers: [] }], extensions: { custom: { preserve: true } } };

function documentOf(bytes) {
  const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + size)));
}

test("inspects actual factors and missing maps/UVs", async () => {
  const [material] = await inspectMaterials(fixture(source));
  assert.equal(material.name, "Original");
  assert.equal(material.color, "#ff0000");
  assert.equal(material.metalness, 1);
  assert.equal(material.maps.ao.available, false);
  assert.equal(material.maps.ao.hasUv, false);
});

test("edits selected factors while preserving geometry, animation, skins and extensions", async () => {
  const bytes = await editMaterials(fixture(source), { materialIndex: 0, roughness: 0.3, opacity: 0.5 });
  const edited = documentOf(bytes);
  assert.equal(edited.materials[0].pbrMetallicRoughness.roughnessFactor, 0.3);
  assert.equal(edited.materials[0].pbrMetallicRoughness.baseColorFactor[3], 0.5);
  assert.equal(edited.materials[0].alphaMode, "BLEND");
  for (const key of ["meshes", "skins", "animations", "extensions"]) assert.deepEqual(edited[key], source[key]);
  assert.deepEqual([...bytes.slice(-4)], [1, 2, 3, 4]);
});

test("rejects invalid material, factors and map replacement without UVs", async () => {
  await assert.rejects(editMaterials(fixture(source), { materialIndex: 2 }), /materialIndex/);
  await assert.rejects(editMaterials(fixture(source), { materialIndex: 0, metalness: 2 }), /factor/);
  await assert.rejects(editMaterials(fixture(source), { materialIndex: 0, replaceMap: { map: "ao", bytes: new Uint8Array() } }), /missingUv/);
});

test("keeps alpha-cutout mode when a factor edit sends unchanged opacity", async () => {
  const doc = structuredClone(source);
  doc.materials[0].alphaMode = "MASK";
  const edited = documentOf(await editMaterials(fixture(doc), { materialIndex: 0, opacity: 1, roughness: 0.2 }));
  assert.equal(edited.materials[0].alphaMode, "MASK");
});

test("enforces explicit upscale ceiling without distorting aspect ratio", () => {
  assert.deepEqual(upscaleDimensions(256, 128, 4), { width: 1024, height: 512 });
  assert.throws(() => upscaleDimensions(2048, 1024, 4), /resolutionLimit/);
  assert.throws(() => upscaleDimensions(0, 128, 2), /dimensions/);
});

test("renormalizes resampled normal vectors preserving alpha", () => {
  const pixels = new Uint8ClampedArray([200, 180, 230, 91]);
  normalizeNormalPixels(pixels);
  const length = Math.hypot(...[...pixels.slice(0, 3)].map((value) => value / 127.5 - 1));
  assert.ok(Math.abs(length - 1) < 0.01);
  assert.equal(pixels[3], 91);
});

test("reports embedded and explicit texture provenance honestly", async () => {
  const doc = structuredClone(source);
  doc.materials[0].pbrMetallicRoughness.baseColorTexture = { index: 0 };
  doc.textures = [{ extras: { formaMapSource: "imported" } }];
  assert.equal((await inspectMaterials(fixture(doc)))[0].maps.albedo.source, "imported");
  delete doc.textures[0].extras;
  assert.equal((await inspectMaterials(fixture(doc)))[0].maps.albedo.source, "embedded");
});
