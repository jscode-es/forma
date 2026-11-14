import test from "node:test";
import assert from "node:assert/strict";
import { engineManifest, variant, defaultScene } from "../electron/schemas.ts";

test("Blender mesh runtime and all phase12 tasks are validated", () => {
  const manifest = engineManifest.parse({ id:"forma-blender-mesh", name:"Blender mesh", version:"1.0.0", license:"MIT", description:{en:"Mesh tools"}, tasks:["mesh-inspect","retopology","uv-unwrap","normals"], runtime:{type:"blender",entry:"main.py"}, inputs:{models:{min:1,max:2}} });
  assert.equal(manifest.runtime.type,"blender");
  assert.equal(manifest.tasks.length,4);
});

test("all modifying mesh operations are valid persisted variant origins", () => {
  for (const origin of ["retopology","uv","normals"]) assert.equal(variant.parse({...defaultScene().variants[0],origin}).origin,origin);
});
