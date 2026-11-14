const { app, BrowserWindow } = require("electron");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const ts = require("typescript");
const { deflateSync } = require("node:zlib");

function transparentPixelPng() {
  const chunk = (name, data) => {
    const payload = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, payload, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 31, 81, 161, 0]))), chunk("IEND", Buffer.alloc(0))]);
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  let exitCode = 0;
  try {
    await window.loadURL("about:blank");
    const source = ts.transpileModule(readFileSync(join(__dirname, "operations.ts"), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
    const result = await window.webContents.executeJavaScript(`(async () => {
      const assert = require('node:assert/strict');
      const { inspectMaterials, editMaterials } = await import('data:text/javascript;base64,${Buffer.from(source).toString("base64")}');
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      const context = canvas.getContext('2d');
      context.fillStyle = 'rgb(30,80,160)'; context.fillRect(0,0,2,2);
      const png = new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve))).arrayBuffer());
      const json = { asset:{version:'2.0'}, buffers:[{byteLength:png.length}], bufferViews:[{buffer:0,byteOffset:0,byteLength:png.length}], images:[{bufferView:0,mimeType:'image/png'}], textures:[{source:0}], materials:[{pbrMetallicRoughness:{metallicRoughnessTexture:{index:0,texCoord:1,extensions:{KHR_texture_transform:{offset:[0.2,0.3]}}}},occlusionTexture:{index:0,texCoord:1}},{pbrMetallicRoughness:{baseColorTexture:{index:0}}}], meshes:[{primitives:[{material:0,attributes:{TEXCOORD_1:0}},{material:1,attributes:{TEXCOORD_0:0}}]}], skins:[{joints:[0]}], animations:[{name:'keep',channels:[],samplers:[]}] };
      const encode = (json,imageBytes=png) => {
        const text = new TextEncoder().encode(JSON.stringify(json)); const size = Math.ceil(text.length/4)*4; const length = Math.ceil(imageBytes.length/4)*4;
        const bytes = new Uint8Array(28+size+length); const view = new DataView(bytes.buffer);
        for(const [offset,value] of [[0,0x46546c67],[4,2],[8,bytes.length],[12,size],[16,0x4e4f534a],[20+size,length],[24+size,0x004e4942]]) view.setUint32(offset,value,true);
        bytes.fill(32,20,20+size); bytes.set(text,20); bytes.set(imageBytes,28+size); return bytes;
      };
      const parse = bytes => { const view=new DataView(bytes.buffer); const length=view.getUint32(12,true); return {json:JSON.parse(new TextDecoder().decode(bytes.slice(20,20+length))),binary:bytes.slice(28+length)}; };
      const before = encode(json);
      const inspected = await inspectMaterials(before);
      assert.equal(inspected[0].maps.ao.width,2); assert.equal(inspected[0].maps.ao.uvChannel,1); assert.equal(inspected[0].maps.ao.hasUv,true);
      context.fillStyle='rgb(210,210,210)'; context.fillRect(0,0,2,2);
      const replacement = new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve))).arrayBuffer());
      const edited=await editMaterials(before,{materialIndex:0,replaceMap:{map:'metallic',bytes:replacement}});
      const {json:output,binary}=parse(edited);
      assert.equal(output.materials[0].occlusionTexture.index,0);
      assert.equal(output.materials[1].pbrMetallicRoughness.baseColorTexture.index,0);
      const mr=output.materials[0].pbrMetallicRoughness.metallicRoughnessTexture;
      assert.equal(mr.texCoord,1); assert.deepEqual(mr.extensions,json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.extensions);
      const image=output.images[output.textures[mr.index].source]; const bv=output.bufferViews[image.bufferView];
      const bitmap=await createImageBitmap(new Blob([binary.slice(bv.byteOffset,bv.byteOffset+bv.byteLength)],{type:'image/png'}),{colorSpaceConversion:'none'});
      context.drawImage(bitmap,0,0); bitmap.close(); const pixel=context.getImageData(0,0,1,1).data;
      assert.equal(pixel[0],30); assert.equal(pixel[1],80); assert.equal(pixel[2],210);
      assert.deepEqual(output.skins,json.skins); assert.deepEqual(output.animations,json.animations);
      assert.deepEqual([...binary.slice(0,png.length)],[...png]);
      const after=await inspectMaterials(edited); assert.equal(after[0].maps.metallic.source,'imported');
      assert.equal(after[0].maps.roughness.source,'embedded');
      const upscaled=await editMaterials(edited,{materialIndex:0,upscale:{factor:2,maps:['metallic','roughness','ao']}});
      const sizes=await inspectMaterials(upscaled); assert.equal(sizes[0].maps.metallic.width,4); assert.equal(sizes[0].maps.roughness.width,4); assert.equal(sizes[0].maps.ao.width,4); assert.equal(sizes[1].maps.albedo.width,2);
      const transparentPng=new Uint8Array(Buffer.from('${transparentPixelPng().toString("base64")}','base64'));
      const transparentDoc=structuredClone(json);
      transparentDoc.buffers[0].byteLength=transparentPng.length; transparentDoc.bufferViews[0].byteLength=transparentPng.length;
      transparentDoc.materials[0].normalTexture={index:0,texCoord:1};
      transparentDoc.meshes[0].primitives[0].attributes.TEXCOORD_0=0;
      const transparentSource=encode(transparentDoc,transparentPng);
      const opaqueSource=encode({...transparentDoc,buffers:json.buffers,bufferViews:json.bufferViews});
      for(const map of ['metallic','roughness','normal','ao']) {
        await assert.rejects(editMaterials(opaqueSource,{materialIndex:0,replaceMap:{map,bytes:transparentPng}}),/materials.transparentDataMap/);
        await assert.rejects(editMaterials(transparentSource,{materialIndex:0,upscale:{factor:2,maps:[map]}}),/materials.transparentDataMap/);
      }
      for(const map of ['metallic','roughness']) await assert.rejects(editMaterials(transparentSource,{materialIndex:0,replaceMap:{map,bytes:replacement}}),/materials.transparentDataMap/);
      canvas.width=1; canvas.height=1;
      context.putImageData(new ImageData(new Uint8ClampedArray([31,81,161,128]),1,1),0,0);
      const transparentWebp=new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/webp'))).arrayBuffer());
      const webpDoc=structuredClone(transparentDoc);
      webpDoc.buffers[0].byteLength=transparentWebp.length; webpDoc.bufferViews[0].byteLength=transparentWebp.length; webpDoc.images[0].mimeType='image/webp';
      const webpSource=encode(webpDoc,transparentWebp);
      for(const map of ['metallic','roughness','normal','ao']) {
        await assert.rejects(editMaterials(opaqueSource,{materialIndex:0,replaceMap:{map,bytes:transparentWebp}}),/materials.transparentDataMap/);
        await assert.rejects(editMaterials(webpSource,{materialIndex:0,upscale:{factor:2,maps:[map]}}),/materials.transparentDataMap/);
        const opaqueEdited=await editMaterials(opaqueSource,{materialIndex:0,replaceMap:{map,bytes:replacement}});
        const opaqueUpscaled=await editMaterials(opaqueEdited,{materialIndex:0,upscale:{factor:2,maps:[map]}});
        assert.equal((await inspectMaterials(opaqueUpscaled))[0].maps[map].width,4);
      }
      await editMaterials(opaqueSource,{materialIndex:0,replaceMap:{map:'albedo',bytes:transparentPng}});
      canvas.width=8192; canvas.height=2;
      const largePng=new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve))).arrayBuffer());
      const largeDoc=structuredClone(json); largeDoc.buffers[0].byteLength=largePng.length; largeDoc.bufferViews[0].byteLength=largePng.length;
      assert.equal((await inspectMaterials(encode(largeDoc,largePng)))[0].maps.ao.width,8192);
      return 'PASS embedded PNG replacement, packed MR counterpart, shared AO/material isolation, UV transform, binary/skin/animation preservation, sequential 2x upscale and transparent PNG/WebP data-map rejection';
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
