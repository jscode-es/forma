import { create } from "zustand";

export type Quality = "fast" | "balanced" | "high";

type ProjectSettings = {
  quality: Quality;
  physicalScale: boolean;
  heightMeters: number;
};

type ProjectState = ProjectSettings & {
  name: string | null;
  dirty: boolean;
  setQuality: (quality: Quality) => void;
  setPhysicalScale: (enabled: boolean) => void;
  setHeightMeters: (height: number) => void;
  newProject: () => void;
};

const DEFAULTS: ProjectSettings = { quality: "balanced", physicalScale: false, heightMeters: 1.8 };

export const useProjectStore = create<ProjectState>()((set) => ({
  ...DEFAULTS,
  name: null,
  dirty: false,
  setQuality: (quality) => set({ quality, dirty: true }),
  setPhysicalScale: (physicalScale) => set({ physicalScale, dirty: true }),
  setHeightMeters: (heightMeters) => set({ heightMeters, dirty: true }),
  newProject: () => set({ ...DEFAULTS, name: null, dirty: false }),
}));
