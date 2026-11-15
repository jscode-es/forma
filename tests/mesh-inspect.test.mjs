import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { Document } from "@gltf-transform/core";

const require = createRequire(import.meta.url);
const { inspectDocument, inspectObject } = require("../engines/mesh-tools/inspect.cjs");

test("counts a split-normal cube like Blender after welding", () => {
  const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]];
  const positions = [];
  const indices = [];
  for (const quad of quads) {
    const base = positions.length / 3;
    quad.forEach((corner) => positions.push(...corners[corner]));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const doc = new Document();
  const buffer = doc.createBuffer();
  const primitive = doc.createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer));
  doc.createScene().addChild(doc.createNode().setScale([100, 100, 100]).setMesh(doc.createMesh().addPrimitive(primitive)));
  assert.deepEqual(inspectDocument(doc), { vertices: 8, edges: 18, faces: 12, triangles: 12, degenerateFaces: 0, boundaryEdges: 0, nonManifoldEdges: 0, components: 1 });
});

test("reports open, disconnected, degenerate and non-manifold geometry", () => {
  const points = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [3, 0, 0], [4, 0, 0], [5, 0, 0]];
  const report = inspectObject(points, [[0, 1, 2], [1, 0, 3], [0, 1, 4], [5, 6, 7]]);
  assert.equal(report.components, 2);
  assert.equal(report.degenerateFaces, 1);
  assert.equal(report.boundaryEdges, 9);
  assert.equal(report.nonManifoldEdges, 10);
});
