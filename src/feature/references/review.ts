export type Bounds = { x: number; y: number; width: number; height: number };

export function silhouetteBounds(pixels: Uint8ClampedArray, width: number, height: number): Bounds | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 16) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function heightTransform(bounds: Bounds, size: number, heightFraction = 0.8) {
  const scale = size * heightFraction / bounds.height;
  return { scale, x: size / 2 - (bounds.x + bounds.width / 2) * scale, y: size * 0.9 - (bounds.y + bounds.height) * scale };
}
