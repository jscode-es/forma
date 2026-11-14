import { create } from "zustand";
import type { MaterialInfo } from "./types";

export type MaterialDraft = Pick<MaterialInfo, "color" | "metalness" | "roughness" | "opacity">;
type MaterialSelection = { selected: number; drafts: Record<number, MaterialDraft> };

type MaterialsState = {
  sessionId: string | null;
  sources: Record<string, MaterialSelection>;
  initialize: (sessionId: string, sourceId: string, materials: MaterialInfo[]) => void;
  select: (sourceId: string, index: number) => void;
  update: (sourceId: string, index: number, patch: Partial<MaterialDraft>) => void;
};

export const useMaterialsStore = create<MaterialsState>()((set) => ({
  sessionId: null,
  sources: {},
  initialize: (sessionId, sourceId, materials) => set((state) => {
    const sources = state.sessionId === sessionId ? state.sources : {};
    if (sources[sourceId]) return { sessionId, sources };
    const drafts = Object.fromEntries(materials.map(({ index, color, metalness, roughness, opacity }) => [index, { color, metalness, roughness, opacity }]));
    return { sessionId, sources: { ...sources, [sourceId]: { selected: materials[0]?.index ?? 0, drafts } } };
  }),
  select: (sourceId, selected) => set((state) => ({ sources: { ...state.sources, [sourceId]: { ...state.sources[sourceId], selected } } })),
  update: (sourceId, index, patch) => set((state) => {
    const source = state.sources[sourceId];
    return { sources: { ...state.sources, [sourceId]: { ...source, drafts: { ...source.drafts, [index]: { ...source.drafts[index], ...patch } } } } };
  }),
}));
