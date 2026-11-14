import { create } from "zustand";
import { persist } from "zustand/middleware";

export type MeshTopology = {
  vertices: number;
  edges: number;
  faces: number;
  triangles: number;
  degenerateFaces: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  components: number;
};

export type MeshReport = {
  version: 1;
  task: string;
  source: MeshTopology;
  result?: MeshTopology;
  warnings: string[];
  details: Record<string, unknown>;
};

type ReportEntry = { sessionId: string; jobId: string; report: MeshReport };
type UvTemplate = { sessionId: string; jobId: string; path: string; variantId: string; resultVariantId?: string };
type Draft = { faceBudget: number; resolution: "512" | "1024" | "2048" | "4096"; normalMode: "recalculate" | "bake"; highVariantId: string | null; occlusionSamples: number };
type MeshToolsState = Draft & {
  reports: Record<string, ReportEntry>;
  lastUv: UvTemplate | null;
  setDraft: (draft: Partial<Draft>) => void;
};

export const useMeshToolsStore = create<MeshToolsState>()(persist((set) => ({
  faceBudget: 10000,
  resolution: "1024",
  normalMode: "recalculate",
  highVariantId: null,
  occlusionSamples: 64,
  reports: {},
  lastUv: null,
  setDraft: (draft) => set(draft),
}), {
  name: "forma-mesh-tools",
  skipHydration: true,
  partialize: ({ faceBudget, resolution, normalMode, highVariantId, occlusionSamples }) => ({ faceBudget, resolution, normalMode, highVariantId, occlusionSamples }),
}));

export function recordMeshReport(variantId: string, entry: ReportEntry) {
  useMeshToolsStore.setState((state) => ({ reports: { ...state.reports, [variantId]: entry } }));
}

export function recordUvTemplate(lastUv: UvTemplate | null) {
  useMeshToolsStore.setState({ lastUv });
}
