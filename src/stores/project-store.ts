import { create } from "zustand";
import type {
  EngineSelection,
  ImageSource,
  ParameterValue,
  Project,
  ProjectScene,
  ProjectSettings,
  Quality,
  ReferenceImage,
  SceneModel,
} from "@/lib/forma";

export type { Quality };

export const QUALITY_STEPS: Record<Quality, number> = { fast: 15, balanced: 30, high: 50 };

type ProjectState = ProjectSettings & {
  id: string | null;
  sessionId: string;
  name: string | null;
  model: SceneModel;
  references: ReferenceImage[];
  dirty: boolean;
  setQuality: (quality: Quality) => void;
  setPhysicalScale: (enabled: boolean) => void;
  setHeightMeters: (height: number) => void;
  setModel: (model: SceneModel) => void;
  setEngine: (id: string | null) => void;
  setEngineParameter: (key: string, value: ParameterValue) => void;
  setReference: (reference: ReferenceImage) => void;
  updateReference: (id: string, patch: Partial<Pick<ReferenceImage, "prepared" | "usePrepared">>) => void;
  removeReference: (id: string) => void;
  setName: (name: string) => void;
  load: (project: Project) => void;
  newProject: () => void;
};

const DEFAULT_ENGINE: EngineSelection = { id: null, parameters: {} };
export const DEFAULT_SETTINGS: ProjectSettings = {
  quality: "balanced",
  physicalScale: false,
  heightMeters: 1.8,
  engine: DEFAULT_ENGINE,
};
const DEFAULT_MODEL: SceneModel = { type: "default-cube" };

export const useProjectStore = create<ProjectState>()((set) => ({
  ...DEFAULT_SETTINGS,
  id: null,
  sessionId: crypto.randomUUID(),
  name: null,
  model: DEFAULT_MODEL,
  references: [],
  dirty: false,
  setQuality: (quality) =>
    set((s) => {
      const parameters = { ...s.engine.parameters };
      delete parameters.steps;
      return { quality, engine: { ...s.engine, parameters }, dirty: true };
    }),
  setPhysicalScale: (physicalScale) => set({ physicalScale, dirty: true }),
  setHeightMeters: (heightMeters) => set({ heightMeters, dirty: true }),
  setModel: (model) => set({ model, dirty: true }),
  setEngine: (id) => set({ engine: { id, parameters: {} }, dirty: true }),
  setEngineParameter: (key, value) =>
    set((s) => ({ engine: { ...s.engine, parameters: { ...s.engine.parameters, [key]: value } }, dirty: true })),
  setReference: (reference) => set({ references: [reference], dirty: true }),
  updateReference: (id, patch) =>
    set((s) => ({ references: s.references.map((r) => (r.id === id ? { ...r, ...patch } : r)), dirty: true })),
  removeReference: (id) => set((s) => ({ references: s.references.filter((r) => r.id !== id), dirty: true })),
  setName: (name) => set({ name }),
  load: (project) =>
    set({
      ...project.settings,
      id: project.id,
      sessionId: crypto.randomUUID(),
      name: project.name,
      model: project.scene.model,
      references: project.scene.references,
      dirty: false,
    }),
  newProject: () =>
    set({
      ...DEFAULT_SETTINGS,
      id: null,
      sessionId: crypto.randomUUID(),
      name: null,
      model: DEFAULT_MODEL,
      references: [],
      dirty: false,
    }),
}));

export function currentSettings(): ProjectSettings {
  const { quality, physicalScale, heightMeters, engine } = useProjectStore.getState();
  return { quality, physicalScale, heightMeters, engine };
}

export function currentScene(): ProjectScene {
  const { model, references } = useProjectStore.getState();
  return { model, references };
}

export function activeImage(reference: ReferenceImage): ImageSource {
  return reference.usePrepared && reference.prepared ? reference.prepared : reference.original;
}
