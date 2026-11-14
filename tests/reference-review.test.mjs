import assert from "node:assert/strict";
import test from "node:test";
import { silhouetteBounds, heightTransform } from "../src/feature/references/review.ts";

test("measures only visible pixels and rejects empty silhouettes", () => {
  const pixels = new Uint8ClampedArray(4 * 6 * 4);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 3; x++) pixels[(y * 4 + x) * 4 + 3] = 255;
  assert.deepEqual(silhouetteBounds(pixels, 4, 6), { x: 1, y: 1, width: 2, height: 4 });
  assert.equal(silhouetteBounds(new Uint8ClampedArray(16), 2, 2), null);
});

test("matches height with a uniform scale and centers without stretching", () => {
  const transform = heightTransform({ x: 20, y: 10, width: 40, height: 80 }, 512);
  assert.equal(transform.scale, 5.12);
  assert.equal(transform.x + 40 * transform.scale, 256);
  assert.equal(transform.y + 90 * transform.scale, 460.8);
});

test("fits wide silhouettes at a shared height without cropping", () => {
  const bounds = { x: 0, y: 0, width: 400, height: 80 };
  const fraction = Math.min(0.8, 0.9 * bounds.height / bounds.width);
  const transform = heightTransform(bounds, 1024, fraction);
  assert.ok(bounds.width * transform.scale <= 1024 * 0.9 + 1e-9);
  assert.ok(transform.x >= 0);
});
