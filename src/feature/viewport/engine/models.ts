import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, Object3D, Texture, Vector3, type Material } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export type ModelStats = {
  vertices: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  size: { x: number; y: number; z: number };
};

export function createDefaultCube(name: string): Object3D {
  const cube = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ color: 0xa8a8b0, roughness: 0.6, metalness: 0 }),
  );
  cube.name = name;
  return cube;
}

export async function parseGlb(bytes: Uint8Array): Promise<Object3D> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const gltf = await loader.parseAsync(buffer, "");
  return gltf.scene;
}

export function computeStats(object: Object3D): ModelStats {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  const materials = new Set<Material>();
  const textures = new Set<Texture>();

  object.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    meshes++;
    const position = node.geometry.getAttribute("position");
    vertices += position?.count ?? 0;
    triangles += Math.floor((node.geometry.index?.count ?? position?.count ?? 0) / 3);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      materials.add(material);
      for (const value of Object.values(material as Record<string, unknown>)) {
        if (value instanceof Texture) textures.add(value);
      }
    }
  });

  const size = new Box3().setFromObject(object).getSize(new Vector3());
  return { vertices, triangles, meshes, materials: materials.size, textures: textures.size, size: { x: size.x, y: size.y, z: size.z } };
}
