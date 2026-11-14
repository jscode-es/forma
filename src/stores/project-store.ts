import { create } from "zustand";
import type { EngineSelection, ParameterValue, Project, ProjectScene, ProjectSettings, Quality, SceneModel } from "@/lib/forma";

export type { Quality };

type ProjectState = ProjectSettings & {
  id: string | null;
  sessionId: string;
  name: string | null;
  model: SceneModel;
  dirty: boolean;
  setQuality: (quality: Quality) => void;
  setPhysicalScale: (enabled: boolean) => void;
  setHeightMeters: (height: number) => void;
  setModel: (model: SceneModel) => void;
  setEngine: (id: string | null) => void;
  setEngineParameter: (key: string, value: ParameterValue) => void;
  setName: (name: string) => void;
  load: (project: Project) => void;
  newProject: () => void;
};

const DEFAULT_ENGINE: EngineSelection = { id: null, parameters: {} };
export const DEFAULT_SETTINGS: ProjectSettings = { quality: "balanced", physicalScale: false, heightMeters: 1.8, engine: DEFAULT_ENGINE };
const DEFAULT_MODEL: SceneModel = { type: "default-cube" };

export const useProjectStore = create<ProjectState>()((set) => ({
  ...DEFAULT_SETTINGS,
  id: null,
  sessionId: crypto.randomUUID(),
  name: null,
  model: DEFAULT_MODEL,
  dirty: false,
  setQuality: (quality) => set({ quality, dirty: true }),
  setPhysicalScale: (physicalScale) => set({ physicalScale, dirty: true }),
  setHeightMeters: (heightMeters) => set({ heightMeters, dirty: true }),
  setModel: (model) => set({ model, dirty: true }),
  setEngine: (id) => set({ engine: { id, parameters: {} }, dirty: true }),
  setEngineParameter: (key, value) =>
    set((s) => ({ engine: { ...s.engine, parameters: { ...s.engine.parameters, [key]: value } }, dirty: true })),
  setName: (name) => set({ name }),
  load: (project) =>
    set({
      ...project.settings,
      id: project.id,
      sessionId: crypto.randomUUID(),
      name: project.name,
      model: project.scene.model,
      dirty: false,
    }),
  newProject: () =>
    set({ ...DEFAULT_SETTINGS, id: null, sessionId: crypto.randomUUID(), name: null, model: DEFAULT_MODEL, dirty: false }),
}));

export function currentSettings(): ProjectSettings {
  const { quality, physicalScale, heightMeters, engine } = useProjectStore.getState();
  return { quality, physicalScale, heightMeters, engine };
}

export function currentScene(): ProjectScene {
  return { model: useProjectStore.getState().model };
}
