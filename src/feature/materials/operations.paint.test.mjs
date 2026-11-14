import assert from 'node:assert/strict';
import test from 'node:test';
import { readPaintSurface, writePaintSurface } from './operations.ts';

function fixture(change = {}) {
  const json = {asset:{version:'2.0'}, materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.3,.4,.5]}}], meshes:[{primitives:[{material:0,attributes:{TEXCOORD_0:0}}]}], ...change};
  const text = new TextEncoder().encode(JSON.stringify(json)); const size = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(20 + size); const view = new DataView(bytes.buffer);
  for (const [offset, value] of [[0,0x46546c67],[4,2],[8,bytes.length],[12,size],[16,0x4e4f534a]]) view.setUint32(offset,value,true);
  bytes.fill(32,20); bytes.set(text,20); return bytes;
}

test('creates a white bounded surface without baking the material factor', async () => {
  const bytes = fixture(); const before = bytes.slice();
  const pixels = await readPaintSurface(bytes,0,16);
  assert.equal(pixels.width,16); assert.equal(pixels.height,16);
  assert.equal(pixels.data.every(value => value === 255),true);
  assert.deepEqual(bytes,before);
  await assert.rejects(readPaintSurface(bytes,0,2049),/paint.resolutionLimit/);
});

test('requires UV0 on every primitive and a supported material', async () => {
  await assert.rejects(readPaintSurface(fixture(),4),/paint.materialIndex/);
  await assert.rejects(readPaintSurface(fixture({meshes:[{primitives:[{material:0,attributes:{TEXCOORD_0:0}},{material:0,attributes:{POSITION:0}}]}]}),0),/paint.missingUv/);
  await assert.rejects(readPaintSurface(fixture({materials:[{extensions:{KHR_materials_unlit:{}}}]}),0),/paint.unsupportedMaterial/);
  await assert.rejects(readPaintSurface(fixture({materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0,texCoord:1}}}]}),0),/paint.unsupportedUv/);
  await assert.rejects(readPaintSurface(fixture({materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0,extensions:{KHR_texture_transform:{offset:[.1,0]}}}}}]}),0),/paint.unsupportedTransform/);
  await assert.rejects(readPaintSurface(fixture({materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}],textures:[{extensions:{KHR_texture_basisu:{source:0}}}]}),0),/paint.unsupportedImage/);
});

test('validates output dimensions before encoding', async () => {
  await assert.rejects(writePaintSurface(fixture(),0,{width:2049,height:1,data:new Uint8ClampedArray()}),/paint.resolutionLimit/);
  await assert.rejects(writePaintSurface(fixture(),0,{width:2,height:2,data:new Uint8ClampedArray()}),/paint.invalidDimensions/);
});
