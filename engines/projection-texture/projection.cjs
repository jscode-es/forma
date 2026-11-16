const { decode: decodePng } = require("fast-png");
const jpeg = require("jpeg-js");

const VIEWS = {
  front: { dir: [0, 0, 1], up: [0, 1, 0] },
  back: { dir: [0, 0, -1], up: [0, 1, 0] },
  left: { dir: [-1, 0, 0], up: [0, 1, 0] },
  right: { dir: [1, 0, 0], up: [0, 1, 0] },
  top: { dir: [0, 1, 0], up: [0, 0, -1] },
};
const DEPTH_GRID = 1024;
const FILL_WEIGHT = 0.05;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

function decodeImage(buffer) {
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = decodePng(buffer);
    if (png.depth !== 8) throw new Error("image-unsupported");
    const { width, height, channels } = png;
    const data = new Uint8Array(width * height * 4);
    const palette = png.palette;
    for (let i = 0; i < width * height; i++) {
      if (palette) {
        const entry = palette[png.data[i]];
        data.set([entry[0], entry[1], entry[2], entry.length > 3 ? entry[3] : 255], i * 4);
      } else if (channels >= 3) {
        data[i * 4] = png.data[i * channels];
        data[i * 4 + 1] = png.data[i * channels + 1];
        data[i * 4 + 2] = png.data[i * channels + 2];
        data[i * 4 + 3] = channels === 4 ? png.data[i * channels + 3] : 255;
      } else {
        const gray = png.data[i * channels];
        data.set([gray, gray, gray, channels === 2 ? png.data[i * channels + 1] : 255], i * 4);
      }
    }
    return { width, height, data };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const image = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 512 });
    return { width: image.width, height: image.height, data: image.data };
  }
  throw new Error("image-unsupported");
}

function foreground(image) {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) { transparent = true; break; }
  if (transparent) {
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  } else {
    const corners = [0, width - 1, (height - 1) * width, height * width - 1];
    const background = [0, 1, 2].map((c) => corners.reduce((sum, i) => sum + data[i * 4 + c], 0) / 4);
    for (let i = 0; i < mask.length; i++) {
      const distance = Math.abs(data[i * 4] - background[0]) + Math.abs(data[i * 4 + 1] - background[1]) + Math.abs(data[i * 4 + 2] - background[2]);
      mask[i] = distance > 48 ? 1 : 0;
    }
  }
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) throw new Error("reference-empty");
  return { mask: erode(mask, width, height, Math.max(1, Math.round(Math.min(width, height) / 256))), bounds: [x0, y0, x1 + 1, y1 + 1] };
}

function erode(mask, width, height, radius) {
  const pass = (source, horizontal) => {
    const out = new Uint8Array(source.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let keep = 1;
        for (let d = -radius; d <= radius && keep; d++) {
          const nx = horizontal ? x + d : x;
          const ny = horizontal ? y : y + d;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !source[ny * width + nx]) keep = 0;
        }
        out[y * width + x] = keep;
      }
    }
    return out;
  };
  return pass(pass(mask, true), false);
}

function weld(positions) {
  const count = positions.length / 3;
  let extent = 0;
  for (let axis = 0; axis < 3; axis++) {
    let min = Infinity, max = -Infinity;
    for (let i = axis; i < positions.length; i += 3) { min = Math.min(min, positions[i]); max = Math.max(max, positions[i]); }
    extent = Math.max(extent, max - min);
  }
  const step = (extent || 1) * 1e-5;
  const ids = new Uint32Array(count);
  const keys = new Map();
  let unique = 0;
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3] / step)},${Math.round(positions[i * 3 + 1] / step)},${Math.round(positions[i * 3 + 2] / step)}`;
    let id = keys.get(key);
    if (id === undefined) { id = unique++; keys.set(key, id); }
    ids[i] = id;
  }
  const welded = new Float32Array(unique * 3);
  for (let i = 0; i < count; i++) welded.set(positions.subarray(i * 3, i * 3 + 3), ids[i] * 3);
  return { ids, positions: welded, count: unique, extent: extent || 1 };
}

function faceNormal(p, a, b, c) {
  const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
  const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
  return cross(e1, e2);
}

function smoothNormals(mesh, triangles) {
  const normals = new Float32Array(mesh.count * 3);
  for (let f = 0; f < triangles.length; f += 3) {
    const corners = [mesh.ids[triangles[f]], mesh.ids[triangles[f + 1]], mesh.ids[triangles[f + 2]]];
    const n = faceNormal(mesh.positions, ...corners);
    for (const v of corners) for (let k = 0; k < 3; k++) normals[v * 3 + k] += n[k];
  }
  for (let v = 0; v < mesh.count; v++) normals.set(normalize(normals.subarray(v * 3, v * 3 + 3)), v * 3);
  return normals;
}

function adjacency(mesh, triangles) {
  const degree = new Uint32Array(mesh.count + 1);
  for (let f = 0; f < triangles.length; f++) degree[mesh.ids[triangles[f]] + 1] += 2;
  for (let v = 0; v < mesh.count; v++) degree[v + 1] += degree[v];
  const fill = degree.slice(0, mesh.count);
  const neighbors = new Uint32Array(degree[mesh.count]);
  for (let f = 0; f < triangles.length; f += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.ids[triangles[f + k]];
      neighbors[fill[a]++] = mesh.ids[triangles[f + (k + 1) % 3]];
      neighbors[fill[a]++] = mesh.ids[triangles[f + (k + 2) % 3]];
    }
  }
  return { offsets: degree, neighbors };
}

function unwrap(mesh, triangles, resolution, padding) {
  const faces = triangles.length / 3;
  const axis = new Uint8Array(faces);
  const normals = [];
  for (let f = 0; f < faces; f++) {
    const n = normalize(faceNormal(mesh.positions, mesh.ids[triangles[f * 3]], mesh.ids[triangles[f * 3 + 1]], mesh.ids[triangles[f * 3 + 2]]));
    normals.push(n);
    const major = Math.abs(n[0]) >= Math.abs(n[1]) && Math.abs(n[0]) >= Math.abs(n[2]) ? 0 : Math.abs(n[1]) >= Math.abs(n[2]) ? 1 : 2;
    axis[f] = major * 2 + (n[major] >= 0 ? 0 : 1);
  }
  const edges = new Map();
  const faceNeighbors = Array.from({ length: faces }, () => []);
  for (let f = 0; f < faces; f++) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.ids[triangles[f * 3 + k]], b = mesh.ids[triangles[f * 3 + (k + 1) % 3]];
      const key = Math.min(a, b) * mesh.count + Math.max(a, b);
      const other = edges.get(key);
      if (other === undefined) edges.set(key, f);
      else { faceNeighbors[f].push(other); faceNeighbors[other].push(f); }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = axis.slice();
    for (let f = 0; f < faces; f++) {
      const votes = new Map();
      for (const g of faceNeighbors[f]) votes.set(axis[g], (votes.get(axis[g]) ?? 0) + 1);
      for (const [candidate, count] of votes) {
        const major = candidate >> 1, sign = candidate & 1 ? -1 : 1;
        if (candidate !== axis[f] && count >= 2 && normals[f][major] * sign > 0.3) next[f] = candidate;
      }
    }
    axis.set(next);
  }
  const chart = new Int32Array(faces).fill(-1);
  const charts = [];
  const planes = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];
  for (let start = 0; start < faces; start++) {
    if (chart[start] >= 0) continue;
    const id = charts.length;
    const [ua, va] = planes[axis[start]];
    const box = { faces: [], u0: Infinity, v0: Infinity, u1: -Infinity, v1: -Infinity, ua, va };
    const stack = [start];
    chart[start] = id;
    while (stack.length) {
      const f = stack.pop();
      box.faces.push(f);
      for (let k = 0; k < 3; k++) {
        const v = mesh.ids[triangles[f * 3 + k]];
        const u = mesh.positions[v * 3 + ua], w = mesh.positions[v * 3 + va];
        box.u0 = Math.min(box.u0, u); box.u1 = Math.max(box.u1, u);
        box.v0 = Math.min(box.v0, w); box.v1 = Math.max(box.v1, w);
      }
      for (const g of faceNeighbors[f]) if (chart[g] < 0 && axis[g] === axis[start]) { chart[g] = id; stack.push(g); }
    }
    charts.push(box);
  }
  const area = charts.reduce((sum, c) => sum + Math.max(c.u1 - c.u0, 1e-9) * Math.max(c.v1 - c.v0, 1e-9), 0);
  const order = charts.map((_, i) => i).sort((a, b) => (charts[b].v1 - charts[b].v0) - (charts[a].v1 - charts[a].v0));
  let low = 0, high = Math.sqrt((resolution * resolution) / area), placed = shelfPack(charts, order, 0, resolution, padding);
  if (!placed) throw new Error("uv-pack-failed");
  for (let step = 0; step < 24; step++) {
    const scale = (low + high) / 2;
    const attempt = shelfPack(charts, order, scale, resolution, padding);
    if (attempt) { placed = attempt; low = scale; } else high = scale;
  }
  const cornerUv = new Float32Array(triangles.length * 2);
  for (let f = 0; f < faces; f++) {
    const c = charts[chart[f]], [x, y] = placed[chart[f]];
    for (let k = 0; k < 3; k++) {
      const v = mesh.ids[triangles[f * 3 + k]];
      cornerUv[(f * 3 + k) * 2] = (x + (mesh.positions[v * 3 + c.ua] - c.u0) * placed.scale) / resolution;
      cornerUv[(f * 3 + k) * 2 + 1] = (y + (c.v1 - mesh.positions[v * 3 + c.va]) * placed.scale) / resolution;
    }
  }
  return { cornerUv, faceChart: chart, charts: charts.length };
}

function shelfPack(charts, order, scale, resolution, padding) {
  const placed = new Array(charts.length);
  let x = 0, y = 0, shelf = 0;
  for (const i of order) {
    const c = charts[i];
    const w = Math.ceil((c.u1 - c.u0) * scale) + 2 * padding;
    const h = Math.ceil((c.v1 - c.v0) * scale) + 2 * padding;
    if (w > resolution) return null;
    if (x + w > resolution) { x = 0; y += shelf; shelf = 0; }
    if (y + h > resolution) return null;
    placed[i] = [x + padding, y + padding];
    x += w;
    shelf = Math.max(shelf, h);
  }
  placed.scale = scale;
  return placed;
}

function prepareView(name, image, mesh, triangles) {
  const preset = VIEWS[name];
  if (!preset) throw new Error("view-unsupported");
  const d = preset.dir, xAxis = normalize(cross(preset.up, d)), yAxis = cross(d, xAxis);
  const { mask, bounds } = foreground(image);
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let v = 0; v < mesh.count; v++) {
    const p = mesh.positions.subarray(v * 3, v * 3 + 3);
    const a = dot(p, xAxis), b = dot(p, yAxis);
    a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
  }
  const kx = (bounds[2] - bounds[0]) / Math.max(a1 - a0, 1e-9);
  const ky = (bounds[3] - bounds[1]) / Math.max(b1 - b0, 1e-9);
  const project = (p) => [bounds[0] + (dot(p, xAxis) - a0) * kx, bounds[1] + (b1 - dot(p, yAxis)) * ky, dot(p, d)];
  const factor = Math.min(1, DEPTH_GRID / Math.max(image.width, image.height));
  const gw = Math.max(1, Math.ceil(image.width * factor)), gh = Math.max(1, Math.ceil(image.height * factor));
  const depth = new Float32Array(gw * gh).fill(-Infinity);
  const projected = new Float32Array(mesh.count * 3);
  for (let v = 0; v < mesh.count; v++) {
    const [x, y, z] = project(mesh.positions.subarray(v * 3, v * 3 + 3));
    projected.set([x * factor, y * factor, z], v * 3);
  }
  for (let f = 0; f < triangles.length; f += 3) {
    rasterize(projected, mesh.ids[triangles[f]], mesh.ids[triangles[f + 1]], mesh.ids[triangles[f + 2]], gw, gh, (index, z) => {
      if (z > depth[index]) depth[index] = z;
    });
  }
  return { dir: d, image, mask, project, factor, gw, gh, depth, epsilon: mesh.extent * 0.01 };
}

function rasterize(points, a, b, c, width, height, visit) {
  const ax = points[a * 3], ay = points[a * 3 + 1], bx = points[b * 3], by = points[b * 3 + 1], cx = points[c * 3], cy = points[c * 3 + 1];
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(area) < 1e-12) return;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
  const tolerance = -1e-4;
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5;
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < tolerance || w1 < tolerance || w2 < tolerance) continue;
      visit(y * width + x, w0 * points[a * 3 + 2] + w1 * points[b * 3 + 2] + w2 * points[c * 3 + 2], w0, w1, w2);
    }
  }
}

function sample(view, p, n, sharpness, out) {
  const facing = dot(n, view.dir);
  if (facing <= 0.05) return 0;
  const [x, y, z] = view.project(p);
  const { width, height, data } = view.image;
  if (x < 0 || y < 0 || x >= width - 1 || y >= height - 1) return 0;
  const gx = Math.min(view.gw - 1, Math.floor(x * view.factor)), gy = Math.min(view.gh - 1, Math.floor(y * view.factor));
  if (z < view.depth[gy * view.gw + gx] - view.epsilon) return 0;
  const ix = Math.floor(x), iy = Math.floor(y);
  if (!view.mask[iy * width + ix]) return 0;
  const fx = x - ix, fy = y - iy;
  const weight = facing ** sharpness;
  for (let channel = 0; channel < 3; channel++) {
    const at = (dx, dy) => data[((iy + dy) * width + ix + dx) * 4 + channel];
    const value = (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy;
    out[channel] += value * weight;
  }
  return weight;
}

function vertexColors(mesh, normals, graph, views, sharpness) {
  const colors = new Float32Array(mesh.count * 3);
  const known = new Uint8Array(mesh.count);
  const accum = [0, 0, 0];
  let seen = 0;
  for (let v = 0; v < mesh.count; v++) {
    accum.fill(0);
    let total = 0;
    const p = mesh.positions.subarray(v * 3, v * 3 + 3), n = normals.subarray(v * 3, v * 3 + 3);
    for (const view of views) total += sample(view, p, n, sharpness, accum);
    if (total > 1e-3) {
      colors.set(accum.map((value) => value / total), v * 3);
      known[v] = 1;
      seen++;
    }
  }
  if (!seen) throw new Error("projection-empty");
  let frontier = [];
  for (let v = 0; v < mesh.count; v++) if (!known[v]) frontier.push(v);
  while (frontier.length) {
    const next = [], resolved = [];
    for (const v of frontier) {
      const sum = [0, 0, 0];
      let count = 0;
      for (let i = graph.offsets[v]; i < graph.offsets[v + 1]; i++) {
        const u = graph.neighbors[i];
        if (known[u] !== 1) continue;
        for (let k = 0; k < 3; k++) sum[k] += colors[u * 3 + k];
        count++;
      }
      if (count) resolved.push([v, sum.map((value) => value / count)]);
      else next.push(v);
    }
    if (!resolved.length) {
      for (const v of next) colors.set([128, 128, 128], v * 3);
      break;
    }
    for (const [v, color] of resolved) { colors.set(color, v * 3); known[v] = 1; }
    frontier = next;
  }
  return colors;
}

function bake({ mesh, triangles, cornerUv, views, resolution, sharpness, progress }) {
  const normals = smoothNormals(mesh, triangles);
  const graph = adjacency(mesh, triangles);
  const fill = vertexColors(mesh, normals, graph, views, sharpness);
  const size = resolution * resolution;
  const color = new Float32Array(size * 3);
  const covered = new Uint8Array(size);
  const uvPoints = new Float32Array(3 * 3);
  const accum = [0, 0, 0], p = [0, 0, 0], n = [0, 0, 0];
  let projected = 0;
  const faces = triangles.length / 3;
  for (let f = 0; f < faces; f++) {
    if (f % 20000 === 0) progress(f / faces);
    const corners = [mesh.ids[triangles[f * 3]], mesh.ids[triangles[f * 3 + 1]], mesh.ids[triangles[f * 3 + 2]]];
    for (let k = 0; k < 3; k++) uvPoints.set([cornerUv[(f * 3 + k) * 2] * resolution, cornerUv[(f * 3 + k) * 2 + 1] * resolution, 0], k * 3);
    rasterize(uvPoints, 0, 1, 2, resolution, resolution, (index, _z, w0, w1, w2) => {
      const weights = [w0, w1, w2];
      p.fill(0); n.fill(0); accum.fill(0);
      for (let k = 0; k < 3; k++) {
        const v = corners[k];
        for (let c = 0; c < 3; c++) {
          p[c] += mesh.positions[v * 3 + c] * weights[k];
          n[c] += normals[v * 3 + c] * weights[k];
          accum[c] += fill[v * 3 + c] * weights[k] * FILL_WEIGHT;
        }
      }
      const unit = normalize(n);
      let total = FILL_WEIGHT;
      for (const view of views) total += sample(view, p, unit, sharpness, accum);
      if (total > FILL_WEIGHT * 2) projected++;
      for (let c = 0; c < 3; c++) color[index * 3 + c] = accum[c] / total;
      covered[index] = 1;
    });
  }
  dilate(color, covered, resolution, 8);
  const pixels = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    for (let c = 0; c < 3; c++) pixels[i * 4 + c] = Math.max(0, Math.min(255, Math.round(color[i * 3 + c])));
    pixels[i * 4 + 3] = 255;
  }
  const texels = covered.reduce((sum, value) => sum + value, 0);
  return { pixels, coverage: texels ? projected / texels : 0 };
}

function dilate(color, covered, resolution, passes) {
  for (let pass = 0; pass < passes; pass++) {
    const added = [];
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const i = y * resolution + x;
        if (covered[i]) continue;
        const sum = [0, 0, 0];
        let count = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= resolution || ny >= resolution) continue;
          const j = ny * resolution + nx;
          if (covered[j] !== 1) continue;
          for (let c = 0; c < 3; c++) sum[c] += color[j * 3 + c];
          count++;
        }
        if (count) added.push([i, sum.map((value) => value / count)]);
      }
    }
    for (const [i, value] of added) { color.set(value, i * 3); covered[i] = 1; }
  }
}

module.exports = { VIEWS, decodeImage, weld, unwrap, prepareView, bake };
