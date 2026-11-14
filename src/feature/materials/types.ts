export type MaterialMap = "albedo" | "metallic" | "roughness" | "normal" | "ao";

export type MaterialMapInfo = {
  available: boolean;
  width: number;
  height: number;
  uvChannel: number;
  hasUv: boolean;
  source: "imported" | "generated" | "baked" | "embedded" | "painted";
};

export type MaterialInfo = {
  index: number;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  opacity: number;
  maps: Record<MaterialMap, MaterialMapInfo>;
  editable: boolean;
};

export type MaterialEdit = {
  materialIndex: number;
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  replaceMap?: { map: MaterialMap; bytes: Uint8Array };
  upscale?: { factor: 2 | 4; maps: MaterialMap[] };
};
