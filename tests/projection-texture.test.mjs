import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { weld, unwrap, prepareView, bake } = require("../engines/projection-texture/projection.cjs");

function sphere(segments = 24) {
  const positions = [], triangles = [];
  for (let i = 0; i <= segments; i++) {
    for (let j = 0; j <= segments; j++) {
      const t = (i / segments) * Math.PI, p = (j / segments) * 2 * Math.PI;
      positions.push(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p));
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + segments + 1;
      triangles.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return { positions: new Float32Array(positions), triangles: new Uint32Array(triangles) };
}

function disc(color, size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - size / 2) ** 2 + (y - size / 2) ** 2 <= (size * 0.45) ** 2) data.set([...color, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

function texelColor(pixels, resolution, uv) {
  const index = (Math.floor(uv[1] * resolution) * resolution + Math.floor(uv[0] * resolution)) * 4;
  return [...pixels.subarray(index, index + 3)];
}

test("projects each view onto the faces that look at it", () => {
  const { positions, triangles } = sphere();
  const mesh = weld(positions);
  const resolution = 256;
  const { cornerUv } = unwrap(mesh, triangles, resolution, 2);
  for (const value of cornerUv) assert.ok(value >= 0 && value <= 1);
  const views = [prepareView("front", disc([255, 0, 0]), mesh, triangles), prepareView("back", disc([0, 0, 255]), mesh, triangles)];
  const { pixels, coverage } = bake({ mesh, triangles, cornerUv, views, resolution, sharpness: 4, progress: () => {} });
  assert.ok(coverage > 0.3, `coverage ${coverage}`);
  const facing = (direction) => {
    let best = -1, face = 0;
    for (let f = 0; f < triangles.length / 3; f++) {
      const z = [0, 1, 2].reduce((sum, k) => sum + mesh.positions[mesh.ids[triangles[f * 3 + k]] * 3 + 2], 0) * direction;
      if (z > best) { best = z; face = f; }
    }
    return [0, 1, 2].reduce((uv, k) => [uv[0] + cornerUv[(face * 3 + k) * 2] / 3, uv[1] + cornerUv[(face * 3 + k) * 2 + 1] / 3], [0, 0]);
  };
  const front = texelColor(pixels, resolution, facing(1));
  const back = texelColor(pixels, resolution, facing(-1));
  assert.ok(front[0] > 200 && front[2] < 50, `front ${front}`);
  assert.ok(back[2] > 200 && back[0] < 50, `back ${back}`);
});

test("rejects transparent references without a visible object and accepts opaque crops", () => {
  const { positions, triangles } = sphere(4);
  const mesh = weld(positions);
  assert.throws(() => prepareView("front", { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) }, mesh, triangles), /reference-empty/);
  assert.doesNotThrow(() => prepareView("front", { width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(255) }, mesh, triangles));
});

function shape(color, { size = 160, cx = 80, cy = 80, radius = 64, stand = false } = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 || (stand && Math.abs(x - cx) < 4 && y > cy + radius - 2 && y < cy + radius * 1.4);
      if (inside) data.set([...color, 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, data };
}

test("fits the mesh silhouette to references with extra elements", () => {
  const { positions, triangles } = sphere();
  const mesh = weld(positions);
  const view = prepareView("front", shape([200, 100, 50], { cx: 70, cy: 75, radius: 50, stand: true }), mesh, triangles);
  assert.ok(view.iou > view.initialIou + 0.03, `${view.initialIou} -> ${view.iou}`);
  assert.ok(view.iou > 0.93, `${view.iou}`);
});

test("matches exposure between overlapping views", () => {
  const { positions, triangles } = sphere();
  const mesh = weld(positions);
  const views = [prepareView("front", shape([200, 120, 60]), mesh, triangles), prepareView("left", shape([140, 84, 42]), mesh, triangles)];
  const { cornerUv } = unwrap(mesh, triangles, 64, 2);
  bake({ mesh, triangles, cornerUv, views, resolution: 64, sharpness: 4, progress: () => {} });
  for (const gain of views[1].gain) assert.ok(Math.abs(gain - 1 / 0.7) < 0.08, `${views[1].gain}`);
  assert.deepEqual(views[0].gain, [1, 1, 1]);
});
