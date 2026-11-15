const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

function triangleIndices(primitive) {
  const mode = primitive.getMode();
  const indices = primitive.getIndices()?.getArray() ?? Array.from({ length: primitive.getAttribute("POSITION").getCount() }, (_, i) => i);
  if (mode === TRIANGLES) return Array.from({ length: Math.floor(indices.length / 3) }, (_, i) => [indices[i * 3], indices[i * 3 + 1], indices[i * 3 + 2]]);
  if (mode === TRIANGLE_STRIP) return Array.from({ length: Math.max(0, indices.length - 2) }, (_, i) => i % 2 ? [indices[i + 1], indices[i], indices[i + 2]] : [indices[i], indices[i + 1], indices[i + 2]]);
  if (mode === TRIANGLE_FAN) return Array.from({ length: Math.max(0, indices.length - 2) }, (_, i) => [indices[0], indices[i + 1], indices[i + 2]]);
  return [];
}

function transform(matrix, [x, y, z]) {
  return [0, 1, 2].map((i) => matrix[i] * x + matrix[4 + i] * y + matrix[8 + i] * z + matrix[12 + i]);
}

// Same counts the Blender engine reports per object: positions are welded within a tolerance relative to the object size,
// an edge is manifold only when exactly two faces share it, and components are connected groups of welded vertices.
function inspectObject(points, faces) {
  const totals = { vertices: 0, edges: 0, faces: faces.length, triangles: faces.length, degenerateFaces: 0, boundaryEdges: 0, nonManifoldEdges: 0, components: 0 };
  if (!faces.length) return totals;
  const used = [...new Set(faces.flat())];
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  for (const index of used) {
    for (let axis = 0; axis < 3; axis++) {
      low[axis] = Math.min(low[axis], points[index][axis]);
      high[axis] = Math.max(high[axis], points[index][axis]);
    }
  }
  const extent = Math.max(high[0] - low[0], high[1] - low[1], high[2] - low[2]);
  const epsilon = Math.max((extent || 1) * 1e-7, 1e-10);

  for (const [a, b, c] of faces) {
    const u = [0, 1, 2].map((k) => points[b][k] - points[a][k]);
    const v = [0, 1, 2].map((k) => points[c][k] - points[a][k]);
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    if (area <= epsilon * epsilon) totals.degenerateFaces++;
  }

  const welded = new Map();
  const ids = new Map();
  for (const index of used) {
    const key = points[index].map((value) => Math.round(value / epsilon)).join(",");
    if (!welded.has(key)) welded.set(key, welded.size);
    ids.set(index, welded.get(key));
  }
  totals.vertices = welded.size;

  const edges = new Map();
  const parent = Array.from({ length: welded.size }, (_, i) => i);
  const root = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  for (const face of faces) {
    const corners = face.map((index) => ids.get(index));
    if (new Set(corners).size < 3) continue;
    for (let k = 0; k < 3; k++) {
      const [p, q] = [corners[k], corners[(k + 1) % 3]];
      const key = p < q ? `${p},${q}` : `${q},${p}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
      parent[root(p)] = root(q);
    }
  }
  totals.edges = edges.size;
  for (const count of edges.values()) {
    if (count === 1) totals.boundaryEdges++;
    if (count !== 2) totals.nonManifoldEdges++;
  }
  totals.components = new Set(parent.map((_, i) => root(i))).size;
  return totals;
}

function inspectDocument(doc) {
  const totals = { vertices: 0, edges: 0, faces: 0, triangles: 0, degenerateFaces: 0, boundaryEdges: 0, nonManifoldEdges: 0, components: 0 };
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const nodes = [];
  scene?.traverse((node) => { if (node.getMesh()) nodes.push(node); });
  for (const node of nodes) {
    const matrix = node.getWorldMatrix();
    const points = [];
    const faces = [];
    for (const primitive of node.getMesh().listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      const offset = points.length;
      for (let i = 0; i < position.getCount(); i++) points.push(transform(matrix, position.getElement(i, [])));
      for (const face of triangleIndices(primitive)) faces.push(face.map((i) => i + offset));
    }
    const object = inspectObject(points, faces);
    for (const key of Object.keys(totals)) totals[key] += object[key];
  }
  return totals;
}

async function runInspect(job, io, send) {
  send({ type: "progress", value: 0.2, stage: "inspecting" });
  const doc = await io.read(job.inputs.models[0]);
  const report = { version: 1, task: "mesh-inspect", source: inspectDocument(doc), warnings: [], details: {} };
  writeFileSync(join(job.outputDir, "report.json"), JSON.stringify(report, null, 2));
  send({ type: "result", files: [{ path: "report.json", label: "Mesh report", kind: "mesh-report" }] });
}

module.exports = { inspectDocument, inspectObject, runInspect };
