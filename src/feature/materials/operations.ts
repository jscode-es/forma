import type { MaterialEdit, MaterialInfo, MaterialMap } from "./types";
import type { PaintPixels } from "../paint/engine";

type TextureInfo = { index: number; texCoord?: number; extensions?: { KHR_texture_transform?: { texCoord?: number; offset?: number[]; scale?: number[]; rotation?: number } } };
type GltfMaterial = {
  name?: string;
  pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number; baseColorTexture?: TextureInfo; metallicRoughnessTexture?: TextureInfo };
  normalTexture?: TextureInfo;
  occlusionTexture?: TextureInfo;
  alphaMode?: string;
  extensions?: Record<string, unknown>;
};
type GltfDocument = {
  asset: { version: string };
  materials?: GltfMaterial[];
  meshes?: { primitives: { material?: number; attributes: Record<string, number> }[] }[];
  textures?: { source?: number; sampler?: number; extensions?: Record<string, { source?: number }>; extras?: { formaMapSource?: string; formaMapSources?: Partial<Record<MaterialMap, string>> } }[];
  images?: { bufferView?: number; mimeType?: string; uri?: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  buffers?: { byteLength: number; uri?: string }[];
};
type DocumentData = { json: GltfDocument; binary: Uint8Array };
type Pixels = { width: number; height: number; data: Uint8ClampedArray };
const maps: MaterialMap[] = ["albedo", "metallic", "roughness", "normal", "ao"];

function readGlb(bytes: Uint8Array): DocumentData {
  if (bytes.byteLength < 20) throw new Error("materials.invalidGlb");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw new Error("materials.invalidGlb");
  let json: GltfDocument | undefined;
  let binary = new Uint8Array();
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error("materials.invalidGlb");
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (offset + 8 + length > bytes.length || length % 4 !== 0) throw new Error("materials.invalidGlb");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a && !json) json = JSON.parse(new TextDecoder().decode(chunk)) as GltfDocument;
    else if (type === 0x004e4942 && binary.length === 0) binary = new Uint8Array(chunk);
    else throw new Error("materials.unsupportedGlb");
    offset += 8 + length;
  }
  if (!json || json.asset?.version !== "2.0" || json.buffers?.some((buffer, index) => index > 0 || buffer.uri)) throw new Error("materials.unsupportedGlb");
  return { json, binary };
}

function writeGlb({ json, binary }: DocumentData): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binaryLength = Math.ceil(binary.length / 4) * 4;
  const result = new Uint8Array(20 + jsonLength + (binaryLength ? binaryLength + 8 : 0));
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.length, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + jsonLength);
  result.set(text, 20);
  if (binaryLength) {
    view.setUint32(20 + jsonLength, binaryLength, true);
    view.setUint32(24 + jsonLength, 0x004e4942, true);
    result.set(binary, 28 + jsonLength);
  }
  return result;
}

function textureInfo(material: GltfMaterial, map: MaterialMap): TextureInfo | undefined {
  if (map === "albedo") return material.pbrMetallicRoughness?.baseColorTexture;
  if (map === "metallic" || map === "roughness") return material.pbrMetallicRoughness?.metallicRoughnessTexture;
  return map === "normal" ? material.normalTexture : material.occlusionTexture;
}

function uvChannel(info?: TextureInfo): number {
  return info?.extensions?.KHR_texture_transform?.texCoord ?? info?.texCoord ?? 0;
}

function hasUv(json: GltfDocument, materialIndex: number, channel: number): boolean {
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh.primitives).filter((primitive) => primitive.material === materialIndex);
  return primitives.length > 0 && primitives.every((primitive) => primitive.attributes[`TEXCOORD_${channel}`] !== undefined);
}

function imageBytes(document: DocumentData, info: TextureInfo): { bytes: Uint8Array; mimeType: string } {
  const texture = document.json.textures?.[info.index];
  if (!texture || texture.source === undefined) throw new Error("materials.unsupportedImage");
  const image = document.json.images?.[texture.source];
  if (!image || image.uri || image.bufferView === undefined) throw new Error("materials.unsupportedImage");
  const view = document.json.bufferViews?.[image.bufferView];
  if (!view || view.buffer !== 0 || (view.byteOffset ?? 0) + view.byteLength > document.binary.length) throw new Error("materials.unsupportedImage");
  return { bytes: document.binary.slice(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength), mimeType: image.mimeType ?? "application/octet-stream" };
}

async function decode(bytes: Uint8Array, mimeType = "application/octet-stream", dataMap = false, limit = 4096): Promise<Pixels> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeType }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    if (bitmap.width > limit || bitmap.height > limit) throw new Error(limit === 2048 ? "paint.resolutionLimit" : "materials.resolutionLimit");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    if (dataMap) {
      for (let offset = 3; offset < data.length; offset += 4) {
        if (data[offset] !== 255) throw new Error("materials.transparentDataMap");
      }
    }
    return { width: bitmap.width, height: bitmap.height, data };
  } finally {
    bitmap.close();
  }
}

const linearToSrgb = (value: number) => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
const srgbToLinear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

export async function inspectMaterials(bytes: Uint8Array): Promise<MaterialInfo[]> {
  const document = readGlb(bytes);
  const result: MaterialInfo[] = [];
  for (const [index, material] of (document.json.materials ?? []).entries()) {
    const factors = material.pbrMetallicRoughness;
    const color = (factors?.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3).map((value) => Math.round(linearToSrgb(value) * 255).toString(16).padStart(2, "0")).join("");
    const info: MaterialInfo = { index, name: material.name ?? "", color: `#${color}`, metalness: factors?.metallicFactor ?? 1, roughness: factors?.roughnessFactor ?? 1, opacity: factors?.baseColorFactor?.[3] ?? 1, maps: {} as MaterialInfo["maps"], editable: !material.extensions?.KHR_materials_unlit };
    const sizes = new Map<number, { width: number; height: number }>();
    for (const map of maps) {
      const texture = textureInfo(material, map);
      let size = { width: 0, height: 0 };
      if (texture) {
        const cached = sizes.get(texture.index);
        if (cached) size = cached;
        else {
          try {
            const image = imageBytes(document, texture);
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
            size = { width: bitmap.width, height: bitmap.height };
            bitmap.close();
            sizes.set(texture.index, size);
          } catch {
            info.editable = false;
          }
        }
      }
      const channel = uvChannel(texture);
      const extras = texture ? document.json.textures?.[texture.index]?.extras : undefined;
      const source = extras?.formaMapSources?.[map] ?? extras?.formaMapSource;
      info.maps[map] = { available: !!texture, ...size, uvChannel: channel, hasUv: hasUv(document.json, index, channel), source: source === "imported" || source === "generated" || source === "baked" || source === "painted" ? source : "embedded" };
    }
    result.push(info);
  }
  return result;
}

export function upscaleDimensions(width: number, height: number, factor: 2 | 4): { width: number; height: number } {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || (factor !== 2 && factor !== 4)) throw new Error("materials.dimensions");
  if (width * factor > 4096 || height * factor > 4096) throw new Error("materials.resolutionLimit");
  return { width: width * factor, height: height * factor };
}

export function normalizeNormalPixels(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const x = data[i] / 127.5 - 1;
    const y = data[i + 1] / 127.5 - 1;
    const z = data[i + 2] / 127.5 - 1;
    const length = Math.hypot(x, y, z);
    data[i] = length ? (x / length + 1) * 127.5 : 128;
    data[i + 1] = length ? (y / length + 1) * 127.5 : 128;
    data[i + 2] = length ? (z / length + 1) * 127.5 : 255;
  }
}

function resample(source: Pixels, width: number, height: number, color: boolean): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.max(0, Math.min(source.height - 1, (y + 0.5) * source.height / height - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(y0 + 1, source.height - 1);
    for (let x = 0; x < width; x++) {
      const sx = Math.max(0, Math.min(source.width - 1, (x + 0.5) * source.width / width - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(x0 + 1, source.width - 1);
      for (let channel = 0; channel < 4; channel++) {
        const sample = (px: number, py: number) => {
          const value = source.data[(py * source.width + px) * 4 + channel] / 255;
          return color && channel < 3 ? srgbToLinear(value) : value;
        };
        const top = sample(x0, y0) * (1 - sx + x0) + sample(x1, y0) * (sx - x0);
        const bottom = sample(x0, y1) * (1 - sx + x0) + sample(x1, y1) * (sx - x0);
        const value = top * (1 - sy + y0) + bottom * (sy - y0);
        data[(y * width + x) * 4 + channel] = (color && channel < 3 ? linearToSrgb(value) : value) * 255;
      }
    }
  }
  return { width, height, data };
}

async function encode(pixels: Pixels): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("materials.imageEncoding")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}

async function attachImage(document: DocumentData, material: GltfMaterial, map: MaterialMap, pixels: Pixels, imported = false): Promise<void> {
  const bytes = await encode(pixels);
  const offset = Math.ceil(document.binary.length / 4) * 4;
  const binary = new Uint8Array(offset + bytes.length);
  binary.set(document.binary);
  binary.set(bytes, offset);
  document.binary = binary;
  const json = document.json;
  json.buffers ??= [{ byteLength: 0 }];
  json.buffers[0].byteLength = binary.length;
  json.bufferViews ??= [];
  json.images ??= [];
  json.textures ??= [];
  const bufferView = json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }) - 1;
  const source = json.images.push({ bufferView, mimeType: "image/png" }) - 1;
  const oldInfo = textureInfo(material, map);
  const sampler = oldInfo ? json.textures[oldInfo.index]?.sampler : undefined;
  const previousExtras = oldInfo ? json.textures[oldInfo.index]?.extras : undefined;
  const extras = imported ? { ...previousExtras, formaMapSources: { ...previousExtras?.formaMapSources, [map]: "imported" } } : previousExtras;
  const index = json.textures.push({ source, ...(sampler === undefined ? {} : { sampler }), ...(extras ? { extras } : {}) }) - 1;
  const info = { ...oldInfo, index };
  if (map === "albedo") material.pbrMetallicRoughness!.baseColorTexture = info;
  else if (map === "metallic" || map === "roughness") material.pbrMetallicRoughness!.metallicRoughnessTexture = info;
  else if (map === "normal") material.normalTexture = info;
  else material.occlusionTexture = info;
}

export async function editMaterials(bytes: Uint8Array, request: MaterialEdit): Promise<Uint8Array> {
  const document = readGlb(bytes);
  const material = document.json.materials?.[request.materialIndex];
  if (!Number.isInteger(request.materialIndex) || !material) throw new Error("materials.materialIndex");
  if (material.extensions?.KHR_materials_unlit) throw new Error("materials.unsupportedMaterial");
  for (const value of [request.metalness, request.roughness, request.opacity]) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error("materials.factor");
  }
  material.pbrMetallicRoughness ??= {};
  const pbr = material.pbrMetallicRoughness;
  if (request.color !== undefined) {
    if (!/^#[\da-f]{6}$/i.test(request.color)) throw new Error("materials.color");
    const rgb = [1, 3, 5].map((offset) => srgbToLinear(parseInt(request.color!.slice(offset, offset + 2), 16) / 255));
    pbr.baseColorFactor = [...rgb, pbr.baseColorFactor?.[3] ?? 1];
  }
  if (request.opacity !== undefined) {
    const previousOpacity = pbr.baseColorFactor?.[3] ?? 1;
    pbr.baseColorFactor = [...(pbr.baseColorFactor ?? [1, 1, 1, 1]).slice(0, 3), request.opacity];
    if (request.opacity !== previousOpacity) material.alphaMode = request.opacity < 1 ? "BLEND" : "OPAQUE";
  }
  if (request.metalness !== undefined) pbr.metallicFactor = request.metalness;
  if (request.roughness !== undefined) pbr.roughnessFactor = request.roughness;
  if (request.replaceMap) {
    const { map, bytes: replacement } = request.replaceMap;
    if (!maps.includes(map)) throw new Error("materials.map");
    const info = textureInfo(material, map);
    if (!hasUv(document.json, request.materialIndex, uvChannel(info))) throw new Error("materials.missingUv");
    let pixels = await decode(replacement, "application/octet-stream", map !== "albedo");
    if (map === "metallic" || map === "roughness") {
      let packed: Pixels;
      if (info) {
        const old = imageBytes(document, info);
        packed = resample(await decode(old.bytes, old.mimeType, true), pixels.width, pixels.height, false);
      } else packed = { width: pixels.width, height: pixels.height, data: new Uint8ClampedArray(pixels.data.length).fill(255) };
      const channel = map === "metallic" ? 2 : 1;
      for (let offset = 0; offset < pixels.data.length; offset += 4) packed.data[offset + channel] = pixels.data[offset];
      pixels = packed;
    }
    if (map === "normal") normalizeNormalPixels(pixels.data);
    await attachImage(document, material, map, pixels, true);
  }
  if (request.upscale) {
    if (!request.upscale.maps.length || request.upscale.maps.some((map) => !maps.includes(map))) throw new Error("materials.map");
    const processed = new Set<string>();
    for (const map of request.upscale.maps) {
      const key = map === "metallic" || map === "roughness" ? "metallicRoughness" : map;
      if (processed.has(key)) continue;
      processed.add(key);
      const info = textureInfo(material, map);
      if (!info) throw new Error("materials.missingMap");
      if (!hasUv(document.json, request.materialIndex, uvChannel(info))) throw new Error("materials.missingUv");
      const image = imageBytes(document, info);
      const pixels = await decode(image.bytes, image.mimeType, map !== "albedo");
      const size = upscaleDimensions(pixels.width, pixels.height, request.upscale.factor);
      const resized = resample(pixels, size.width, size.height, map === "albedo");
      if (map === "normal") normalizeNormalPixels(resized.data);
      await attachImage(document, material, map, resized);
    }
  }
  return writeGlb(document);
}

function paintMaterial(document: DocumentData, materialIndex: number): GltfMaterial {
  const material = document.json.materials?.[materialIndex];
  if (!Number.isInteger(materialIndex) || !material) throw new Error("paint.materialIndex");
  if (Object.keys(material.extensions ?? {}).length) throw new Error("paint.unsupportedMaterial");
  if (!hasUv(document.json, materialIndex, 0)) throw new Error("paint.missingUv");
  const info = textureInfo(material, "albedo");
  if (uvChannel(info) !== 0 || (info?.texCoord ?? 0) !== 0) throw new Error("paint.unsupportedUv");
  const transform = info?.extensions?.KHR_texture_transform;
  if (transform && ((transform.rotation ?? 0) !== 0 || (transform.offset ?? [0, 0]).some((value) => value !== 0) || (transform.scale ?? [1, 1]).some((value) => value !== 1))) throw new Error("paint.unsupportedTransform");
  if (info) {
    const texture = document.json.textures?.[info.index];
    if (!texture || Object.keys(texture.extensions ?? {}).length || texture.source === undefined) throw new Error("paint.unsupportedImage");
    const image = document.json.images?.[texture.source];
    if (!image || !["image/png", "image/jpeg", "image/webp"].includes(image.mimeType ?? "") || image.uri || image.bufferView === undefined) throw new Error("paint.unsupportedImage");
  }
  return material;
}

function paintDimensions(width: number, height: number): void {
  if (width > 2048 || height > 2048) throw new Error("paint.resolutionLimit");
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error("paint.invalidDimensions");
}

export async function readPaintSurface(bytes: Uint8Array, materialIndex: number, resolution = 1024): Promise<PaintPixels> {
  const document = readGlb(bytes);
  const material = paintMaterial(document, materialIndex);
  const info = textureInfo(material, "albedo");
  if (!info) {
    paintDimensions(resolution, resolution);
    return { width: resolution, height: resolution, data: new Uint8ClampedArray(resolution * resolution * 4).fill(255) };
  }
  let image: ReturnType<typeof imageBytes>;
  try { image = imageBytes(document, info); } catch { throw new Error("paint.unsupportedImage"); }
  try { return await decode(image.bytes, image.mimeType, false, 2048); } catch (error) {
    if (error instanceof Error && error.message === "paint.resolutionLimit") throw error;
    throw new Error("paint.unsupportedImage");
  }
}

export async function writePaintSurface(bytes: Uint8Array, materialIndex: number, pixels: PaintPixels): Promise<Uint8Array> {
  paintDimensions(pixels.width, pixels.height);
  if (pixels.data.length !== pixels.width * pixels.height * 4) throw new Error("paint.invalidDimensions");
  const document = readGlb(bytes);
  const material = paintMaterial(document, materialIndex);
  material.pbrMetallicRoughness ??= {};
  await attachImage(document, material, "albedo", pixels);
  const texture = document.json.textures![material.pbrMetallicRoughness.baseColorTexture!.index];
  texture.extras = { ...texture.extras, formaMapSources: { ...texture.extras?.formaMapSources, albedo: "painted" } };
  return writeGlb(document);
}
