import { Box3, Vector3 } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { parseGlb } from "@/feature/viewport/engine/models";
import { disposeObject } from "@/feature/viewport/engine/viewer";

export async function scaleGlbToHeight(bytes: Uint8Array, heightMeters: number): Promise<Uint8Array> {
  const scene = await parseGlb(bytes);
  try {
    const height = new Box3().setFromObject(scene).getSize(new Vector3()).y;
    if (height <= 0) return bytes;
    scene.scale.multiplyScalar(heightMeters / height);
    scene.updateMatrixWorld(true);
    const output = await new GLTFExporter().parseAsync(scene, { binary: true });
    return new Uint8Array(output as ArrayBuffer);
  } finally {
    disposeObject(scene);
  }
}
