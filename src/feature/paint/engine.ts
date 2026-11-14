export type PaintPixels = { width: number; height: number; data: Uint8ClampedArray };
export type PaintUV = { u: number; v: number };
export type PaintTool = "brush" | "clone" | "eyedropper" | "restore";
export type PaintStroke = { tool: Exclude<PaintTool, "eyedropper">; color: string; radius: number; opacity: number; cloneSource?: PaintUV };

type History = { before: Uint8ClampedArray; after: Uint8ClampedArray };
type ActiveStroke = { before: Uint8ClampedArray; options: PaintStroke; start: PaintUV; last: PaintUV; color: number[] };
const historyLimit = 64 * 1024 * 1024;

function validUv(uv: PaintUV): void {
  if (!Number.isFinite(uv.u) || !Number.isFinite(uv.v) || uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) throw new Error("paint.uv");
}

export class PaintEngine {
  readonly pixels: PaintPixels;
  private readonly original: Uint8ClampedArray;
  private history: History[] = [];
  private cursor = 0;
  private active?: ActiveStroke;
  private changed = 0;

  constructor(pixels: PaintPixels) {
    if (pixels.width > 2048 || pixels.height > 2048) throw new Error("paint.resolutionLimit");
    if (!Number.isInteger(pixels.width) || !Number.isInteger(pixels.height) || pixels.width < 1 || pixels.height < 1 || pixels.data.length !== pixels.width * pixels.height * 4) throw new Error("paint.invalidDimensions");
    this.pixels = { ...pixels, data: new Uint8ClampedArray(pixels.data) };
    this.original = new Uint8ClampedArray(pixels.data);
  }

  get dirty(): boolean { return this.changed > 0; }
  get canUndo(): boolean { return this.cursor > 0; }
  get canRedo(): boolean { return this.cursor < this.history.length; }

  begin(uv: PaintUV, options: PaintStroke): void {
    validUv(uv);
    if (!["brush", "clone", "restore"].includes(options.tool) || !/^#[\da-f]{6}$/i.test(options.color) || !Number.isFinite(options.radius) || options.radius < 1 || options.radius > 128 || !Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 1) throw new Error("paint.stroke");
    if (options.tool === "clone") {
      if (!options.cloneSource) throw new Error("paint.cloneSource");
      validUv(options.cloneSource);
    }
    this.end();
    this.active = { before: new Uint8ClampedArray(this.pixels.data), options: { ...options, cloneSource: options.cloneSource && { ...options.cloneSource } }, start: { ...uv }, last: { ...uv }, color: [1, 3, 5].map((offset) => parseInt(options.color.slice(offset, offset + 2), 16)) };
    this.stamp(uv);
  }

  move(uv: PaintUV): void {
    validUv(uv);
    const active = this.active;
    if (!active) return;
    const dx = uv.u - active.last.u;
    const dy = uv.v - active.last.v;
    if (Math.hypot(dx, dy) <= .25) {
      const distance = Math.hypot(dx * this.pixels.width, dy * this.pixels.height);
      const count = Math.ceil(distance / Math.max(.5, active.options.radius * .4));
      for (let step = 1; step <= count; step++) this.stamp({ u: active.last.u + dx * step / count, v: active.last.v + dy * step / count });
    } else this.stamp(uv);
    active.last = { ...uv };
  }

  end(cancel = false): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined;
    if (cancel) { this.load(active.before); return; }
    if (!this.pixels.data.some((value, index) => value !== active.before[index])) return;
    this.history.splice(this.cursor);
    this.history.push({ before: active.before, after: new Uint8ClampedArray(this.pixels.data) });
    while (this.history.length * this.pixels.data.byteLength * 2 > historyLimit) this.history.shift();
    this.cursor = this.history.length;
  }

  undo(): void {
    this.end(true);
    if (this.canUndo) this.load(this.history[--this.cursor].before);
  }

  redo(): void {
    this.end(true);
    if (this.canRedo) this.load(this.history[this.cursor++].after);
  }

  sample(uv: PaintUV): string {
    validUv(uv);
    const { width, height, data } = this.pixels;
    const offset = (Math.min(height - 1, Math.floor(uv.v * height)) * width + Math.min(width - 1, Math.floor(uv.u * width))) * 4;
    return `#${[0, 1, 2].map((channel) => data[offset + channel].toString(16).padStart(2, "0")).join("")}`;
  }

  private load(data: Uint8ClampedArray): void {
    this.pixels.data.set(data);
    this.changed = 0;
    for (let index = 0; index < data.length; index++) if (data[index] !== this.original[index]) this.changed++;
  }

  private stamp(uv: PaintUV): void {
    const active = this.active!;
    const { width, height, data } = this.pixels;
    const { radius, opacity, tool, cloneSource } = active.options;
    if (!opacity) return;
    const cx = uv.u * width - .5;
    const cy = uv.v * height - .5;
    for (let y = Math.max(0, Math.ceil(cy - radius)); y <= Math.min(height - 1, Math.floor(cy + radius)); y++) {
      for (let x = Math.max(0, Math.ceil(cx - radius)); x <= Math.min(width - 1, Math.floor(cx + radius)); x++) {
        if (Math.hypot(x - cx, y - cy) > radius) continue;
        const offset = (y * width + x) * 4;
        let previous = 0;
        for (let channel = 0; channel < 4; channel++) if (data[offset + channel] !== this.original[offset + channel]) previous++;
        if (tool === "brush") {
          const alpha = opacity + data[offset + 3] / 255 * (1 - opacity);
          for (let channel = 0; channel < 3; channel++) data[offset + channel] = (active.color[channel] * opacity + data[offset + channel] * data[offset + 3] / 255 * (1 - opacity)) / alpha;
          data[offset + 3] = alpha * 255;
        } else {
          let sourceOffset = offset;
          if (tool === "clone") {
            const sx = Math.round(x + (cloneSource!.u - active.start.u) * width);
            const sy = Math.round(y + (cloneSource!.v - active.start.v) * height);
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
            sourceOffset = (sy * width + sx) * 4;
          }
          const source = tool === "restore" ? this.original : active.before;
          for (let channel = 0; channel < 4; channel++) data[offset + channel] = source[sourceOffset + channel] * opacity + data[offset + channel] * (1 - opacity);
        }
        let current = 0;
        for (let channel = 0; channel < 4; channel++) if (data[offset + channel] !== this.original[offset + channel]) current++;
        this.changed += current - previous;
      }
    }
  }
}
