const { app, BrowserWindow } = require("electron");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const ts = require("typescript");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  let exitCode = 0;
  try {
    await window.loadURL("about:blank");
    const source = ts.transpileModule(readFileSync(join(__dirname, "operations.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const result = await window.webContents.executeJavaScript(`(async () => {
      const assert = require('node:assert/strict');
      const { readPaintSurface, writePaintSurface } = await import('data:text/javascript;base64,${Buffer.from(source).toString("base64")}');
      const canvas=document.createElement('canvas'); canvas.width=4; canvas.height=2;
      const context=canvas.getContext('2d'); context.fillStyle='rgb(30,80,160)'; context.fillRect(0,0,4,2);
      const png=new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve))).arrayBuffer());
      const json={asset:{version:'2.0'},buffers:[{byteLength:png.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:png.length}],images:[{bufferView:0,mimeType:'image/png'}],textures:[{source:0,sampler:0,extras:{keep:true}}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.3,.4,.5],baseColorTexture:{index:0,extensions:{KHR_texture_transform:{offset:[0,0],scale:[1,1],rotation:0}}}},normalTexture:{index:0}},{pbrMetallicRoughness:{baseColorTexture:{index:0}}}],meshes:[{primitives:[{material:0,attributes:{TEXCOORD_0:0}},{material:1,attributes:{TEXCOORD_0:0}}]}],skins:[{joints:[0]}],animations:[{name:'keep',channels:[],samplers:[]}]};
      const encode=(json,png)=>{const text=new TextEncoder().encode(JSON.stringify(json));const size=Math.ceil(text.length/4)*4;const length=Math.ceil(png.length/4)*4;const bytes=new Uint8Array(28+size+length);const view=new DataView(bytes.buffer);for(const [offset,value] of [[0,0x46546c67],[4,2],[8,bytes.length],[12,size],[16,0x4e4f534a],[20+size,length],[24+size,0x004e4942]])view.setUint32(offset,value,true);bytes.fill(32,20,20+size);bytes.set(text,20);bytes.set(png,28+size);return bytes;};
      const parse=bytes=>{const size=new DataView(bytes.buffer).getUint32(12,true);return {json:JSON.parse(new TextDecoder().decode(bytes.slice(20,20+size))),binary:bytes.slice(28+size)};};
      const bytes=encode(json,png); const original=bytes.slice();
      const pixels=await readPaintSurface(bytes,0);
      assert.equal(pixels.width,4);assert.equal(pixels.height,2);assert.deepEqual([...pixels.data.slice(0,4)],[30,80,160,255]);
      pixels.data.set([240,20,80,255],0);
      const output=await writePaintSurface(bytes,0,pixels); const parsed=parse(output);
      const after=await readPaintSurface(output,0);assert.deepEqual([...after.data.slice(0,4)],[240,20,80,255]);
      assert.deepEqual(bytes,original);assert.deepEqual([...parsed.binary.slice(0,png.length)],[...png]);
      for(const key of ['meshes','skins','animations'])assert.deepEqual(parsed.json[key],json[key]);
      assert.deepEqual(parsed.json.materials[0].pbrMetallicRoughness.baseColorFactor,json.materials[0].pbrMetallicRoughness.baseColorFactor);
      assert.equal(parsed.json.materials[0].normalTexture.index,0);assert.equal(parsed.json.materials[1].pbrMetallicRoughness.baseColorTexture.index,0);
      const newTexture=parsed.json.textures[parsed.json.materials[0].pbrMetallicRoughness.baseColorTexture.index];
      assert.equal(newTexture.extras.formaMapSources.albedo,'painted');assert.equal(newTexture.extras.keep,true);assert.equal(newTexture.sampler,0);
      canvas.width=2049;canvas.height=1;
      const largePng=new Uint8Array(await(await new Promise(resolve=>canvas.toBlob(resolve))).arrayBuffer());
      const largeJson=structuredClone(json);largeJson.buffers[0].byteLength=largePng.length;largeJson.bufferViews[0].byteLength=largePng.length;
      await assert.rejects(readPaintSurface(encode(largeJson,largePng),0),/paint.resolutionLimit/);
      return 'PASS paint PNG roundtrip, dimensions/factor preservation, shared texture isolation, original binary/geometry/skins/animations, oversized rejection';
    })()`);
    console.log(result);
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    window.destroy();
    app.exit(exitCode);
  }
});
