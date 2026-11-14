import { create } from "zustand";
import type { Project, ProjectSettings, Quality } from "@/lib/forma";

export type { Quality };

type ProjectState = ProjectSettings & {
  id: string | null;
  name: string | null;
  dirty: boolean;
  setQuality: (quality: Quality) => void;
  setPhysicalScale: (enabled: boolean) => void;
  setHeightMeters: (height: number) => void;
  setName: (name: string) => void;
  load: (project: Project) => void;
  newProject: () => void;
};

export const DEFAULT_SETTINGS: ProjectSettings = { quality: "balanced", physicalScale: false, heightMeters: 1.8 };

export const useProjectStore = create<ProjectState>()((set) => ({
  ...DEFAULT_SETTINGS,
  id: null,
  name: null,
  dirty: false,
  setQuality: (quality) => set({ quality, dirty: true }),
  setPhysicalScale: (physicalScale) => set({ physicalScale, dirty: true }),
  setHeightMeters: (heightMeters) => set({ heightMeters, dirty: true }),
  setName: (name) => set({ name }),
  load: (project) => set({ ...project.settings, id: project.id, name: project.name, dirty: false }),
  newProject: () => set({ ...DEFAULT_SETTINGS, id: null, name: null, dirty: false }),
}));

export function currentSettings(): ProjectSettings {
  const { quality, physicalScale, heightMeters } = useProjectStore.getState();
  return { quality, physicalScale, heightMeters };
}
