import { create } from "zustand";
import type {
  EngineSelection,
  ImageSource,
  ParameterValue,
  Project,
  ProjectScene,
  ProjectSettings,
  PromptEntry,
  Quality,
  QualitySteps,
  ReferenceImage,
  ReferenceView,
  SceneModel,
  Variant,
} from "@/lib/forma";

export type { Quality };

export const DEFAULT_QUALITY_STEPS: QualitySteps = { fast: 15, balanced: 30, high: 50 };
const MAX_VARIANTS = 24;
const MAX_PROMPTS = 50;
type SaveSnapshot = { name: string | null; settings: ProjectSettings; scene: ProjectScene };

type ProjectState = ProjectSettings & {
  id: string | null;
  sessionId: string;
  name: string | null;
  references: ReferenceImage[];
  prompts: PromptEntry[];
  prompt: string;
  variants: Variant[];
  activeVariantId: string;
  previewVariantId: string | null;
  comparing: boolean;
  dirty: boolean;
  retainedVariantIds: string[];
  retainVariant: (id: string) => void;
  releaseVariant: (id: string) => void;
  setQuality: (quality: Quality) => void;
  setQualitySteps: (steps: QualitySteps) => void;
  setPhysicalScale: (enabled: boolean) => void;
  setHeightMeters: (height: number) => void;
  setEngine: (id: string | null) => void;
  setEngineParameter: (key: string, value: ParameterValue) => void;
  setImageEngine: (selection: EngineSelection) => void;
  setImageEngineParameter: (key: string, value: ParameterValue) => void;
  setTextureEngine: (selection: EngineSelection) => void;
  setTextureEngineParameter: (key: string, value: ParameterValue) => void;
  setMultiviewEngine: (selection: EngineSelection) => void;
  setMultiviewEngineParameter: (key: string, value: ParameterValue) => void;
  setAutoTexture: (enabled: boolean) => void;
  setGameReady: (enabled: boolean) => void;
  setGameBudget: (budget: number) => void;
  setPrompt: (prompt: string) => void;
  addPrompt: (entry: PromptEntry) => void;
  setReference: (reference: ReferenceImage) => void;
  setReferences: (references: ReferenceImage[]) => void;
  updateReference: (id: string, patch: Partial<Pick<ReferenceImage, "prepared" | "usePrepared">>) => void;
  removeReference: (id: string) => void;
  addVariant: (variant: Omit<Variant, "id" | "createdAt" | "sha256" | "triangles" | "parentId">, apply: boolean, parentId?: string) => void;
  previewVariant: (id: string | null) => void;
  applyVariant: (id: string) => void;
  discardVariant: (id: string) => void;
  setComparing: (comparing: boolean) => void;
  recordTriangles: (id: string, triangles: number) => void;
  setName: (name: string) => void;
  load: (project: Project) => void;
  acceptSaved: (project: Project, snapshot: SaveSnapshot) => void;
  newProject: () => void;
};

const DEFAULT_ENGINE: EngineSelection = { id: null, parameters: {} };
export const DEFAULT_SETTINGS: ProjectSettings = {
  quality: "balanced",
  qualitySteps: DEFAULT_QUALITY_STEPS,
  physicalScale: false,
  heightMeters: 1.8,
  engine: DEFAULT_ENGINE,
  imageEngine: DEFAULT_ENGINE,
  textureEngine: DEFAULT_ENGINE,
  multiviewEngine: DEFAULT_ENGINE,
  autoTexture: false,
  gameReady: false,
  gameBudget: 10000,
};
const DEFAULT_VARIANT_ID = "00000000-0000-4000-8000-000000000000";

function defaultVariants(): Pick<ProjectState, "variants" | "activeVariantId" | "previewVariantId" | "comparing"> {
  return {
    variants: [
      {
        id: DEFAULT_VARIANT_ID,
        label: "Cube",
        origin: "default",
        parentId: null,
        engineId: null,
        model: { type: "default-cube" },
        lods: [],
        params: {},
        createdAt: new Date(0).toISOString(),
        sha256: null,
        triangles: 12,
      },
    ],
    activeVariantId: DEFAULT_VARIANT_ID,
    previewVariantId: null,
    comparing: false,
  };
}

export const REFERENCE_VIEWS: ReferenceView[] = ["front", "back", "left", "right", "top"];

function sortViews(references: ReferenceImage[]) {
  return [...references].sort((a, b) => REFERENCE_VIEWS.indexOf(a.view) - REFERENCE_VIEWS.indexOf(b.view));
}

function variantsChanged(current: Variant[], saved: Variant[]) {
  if (current === saved) return false;
  if (current.length !== saved.length) return true;
  return current.some((variant, index) => {
    const before = saved[index];
    if (variant === before) return false;
    return !before || (Object.keys(variant) as (keyof Variant)[]).some((key) => key !== "triangles" && variant[key] !== before[key]);
  });
}

function trim(variants: Variant[], keep: string[]) {
  const extra = variants.length - MAX_VARIANTS;
  if (extra <= 0) return variants;
  const removable = variants.filter((v) => !keep.includes(v.id)).slice(0, extra).map((v) => v.id);
  return variants.filter((v) => !removable.includes(v.id));
}

export const useProjectStore = create<ProjectState>()((set) => ({
  ...DEFAULT_SETTINGS,
  ...defaultVariants(),
  retainedVariantIds: [],
  retainVariant: (id) => set((s) => ({ retainedVariantIds: [...s.retainedVariantIds, id] })),
  releaseVariant: (id) => set((s) => {
    const index = s.retainedVariantIds.indexOf(id);
    return { retainedVariantIds: s.retainedVariantIds.filter((_, i) => i !== index) };
  }),
  id: null,
  sessionId: crypto.randomUUID(),
  name: null,
  references: [],
  prompts: [],
  prompt: "",
  dirty: false,
  setQuality: (quality) =>
    set((s) => {
      const parameters = { ...s.engine.parameters };
      delete parameters.steps;
      return { quality, engine: { ...s.engine, parameters }, dirty: true };
    }),
  setQualitySteps: (qualitySteps) =>
    set((s) => {
      const parameters = { ...s.engine.parameters };
      delete parameters.steps;
      return { qualitySteps, engine: { ...s.engine, parameters }, dirty: true };
    }),
  setPhysicalScale: (physicalScale) => set({ physicalScale, dirty: true }),
  setHeightMeters: (heightMeters) => set({ heightMeters, dirty: true }),
  setEngine: (id) => set({ engine: { id, parameters: {} }, dirty: true }),
  setEngineParameter: (key, value) =>
    set((s) => ({ engine: { ...s.engine, parameters: { ...s.engine.parameters, [key]: value } }, dirty: true })),
  setImageEngine: (imageEngine) => set({ imageEngine, dirty: true }),
  setTextureEngine: (textureEngine) => set({ textureEngine, dirty: true }),
  setTextureEngineParameter: (key, value) => set((s) => ({ textureEngine: { ...s.textureEngine, parameters: { ...s.textureEngine.parameters, [key]: value } }, dirty: true })),
  setMultiviewEngine: (multiviewEngine) => set({ multiviewEngine, dirty: true }),
  setMultiviewEngineParameter: (key, value) => set((s) => ({ multiviewEngine: { ...s.multiviewEngine, parameters: { ...s.multiviewEngine.parameters, [key]: value } }, dirty: true })),
  setAutoTexture: (autoTexture) => set({ autoTexture, dirty: true }),
  setGameReady: (gameReady) => set({ gameReady, dirty: true }),
  setGameBudget: (gameBudget) => set({ gameBudget, dirty: true }),
  setImageEngineParameter: (key, value) =>
    set((s) => ({ imageEngine: { ...s.imageEngine, parameters: { ...s.imageEngine.parameters, [key]: value } }, dirty: true })),
  setPrompt: (prompt) => set({ prompt }),
  addPrompt: (entry) => set((s) => ({ prompts: [entry, ...s.prompts].slice(0, MAX_PROMPTS), dirty: true })),
  setReference: (reference) =>
    set((s) => ({ references: sortViews([...s.references.filter((r) => r.view !== reference.view), reference]), dirty: true })),
  setReferences: (references) => set({ references: sortViews(references), dirty: true }),
  updateReference: (id, patch) =>
    set((s) => ({ references: s.references.map((r) => (r.id === id ? { ...r, ...patch } : r)), dirty: true })),
  removeReference: (id) => set((s) => ({ references: s.references.filter((r) => r.id !== id), dirty: true })),
  addVariant: (input, apply, parentId) =>
    set((s) => {
      if (parentId && !s.variants.some((v) => v.id === parentId)) return s;
      const variant: Variant = {
        ...input,
        id: crypto.randomUUID(),
        parentId: parentId ?? s.activeVariantId,
        createdAt: new Date().toISOString(),
        sha256: null,
        triangles: null,
      };
      const keep = [s.activeVariantId, variant.id, variant.parentId!, ...s.retainedVariantIds];
      return {
        variants: trim([...s.variants, variant], keep),
        activeVariantId: apply ? variant.id : s.activeVariantId,
        previewVariantId: apply ? null : variant.id,
        comparing: false,
        dirty: true,
      };
    }),
  previewVariant: (id) => set((s) => ({ previewVariantId: id === s.activeVariantId ? null : id, comparing: false })),
  applyVariant: (id) => set({ activeVariantId: id, previewVariantId: null, comparing: false, dirty: true }),
  discardVariant: (id) =>
    set((s) => {
      if (id === s.activeVariantId || s.retainedVariantIds.includes(id)) return {};
      return {
        variants: s.variants.filter((v) => v.id !== id),
        previewVariantId: s.previewVariantId === id ? null : s.previewVariantId,
        comparing: false,
        dirty: true,
      };
    }),
  setComparing: (comparing) => set({ comparing }),
  recordTriangles: (id, triangles) =>
    set((s) => {
      if (!s.variants.some((v) => v.id === id && v.triangles === null)) return {};
      return { variants: s.variants.map((v) => (v.id === id && v.triangles === null ? { ...v, triangles } : v)) };
    }),
  setName: (name) => set({ name }),
  acceptSaved: (project, snapshot) => set((s) => {
    const changed = s.name !== snapshot.name || s.references !== snapshot.scene.references || variantsChanged(s.variants, snapshot.scene.variants) || s.prompts !== snapshot.scene.prompts || s.activeVariantId !== snapshot.scene.activeVariantId || (Object.keys(snapshot.settings) as (keyof ProjectSettings)[]).some((key) => s[key] !== snapshot.settings[key]);
    const variants = s.variants.map((v) => {
      const before = snapshot.scene.variants.find((item) => item.id === v.id);
      const saved = project.scene.variants.find((item) => item.id === v.id);
      if (!before || !saved) return v;
      return { ...v, ...(v.model === before.model ? { model: saved.model, sha256: saved.sha256, triangles: v.triangles ?? saved.triangles } : {}), lods: v.lods === before.lods ? saved.lods : v.lods };
    });
    const references = s.references.map((r) => {
      const before = snapshot.scene.references.find((item) => item.id === r.id);
      const saved = project.scene.references.find((item) => item.id === r.id);
      if (!before || !saved) return r;
      return { ...r, original: r.original === before.original ? saved.original : r.original, prepared: r.prepared === before.prepared ? saved.prepared : r.prepared };
    });
    return { id: project.id, name: s.name === snapshot.name ? project.name : s.name, references, variants, dirty: changed };
  }),
  load: (project) =>
    set({
      retainedVariantIds: [],
      ...project.settings,
      id: project.id,
      sessionId: crypto.randomUUID(),
      name: project.name,
      references: project.scene.references,
      prompts: project.scene.prompts,
      prompt: "",
      variants: project.scene.variants,
      activeVariantId: project.scene.activeVariantId,
      previewVariantId: null,
      comparing: false,
      dirty: false,
    }),
  newProject: () =>
    set({
      retainedVariantIds: [],
      ...DEFAULT_SETTINGS,
      ...defaultVariants(),
      id: null,
      sessionId: crypto.randomUUID(),
      name: null,
      references: [],
      prompts: [],
      prompt: "",
      dirty: false,
    }),
}));

type VariantState = Pick<ProjectState, "variants" | "activeVariantId" | "previewVariantId" | "comparing">;

export function activeVariant(s: VariantState): Variant {
  return s.variants.find((v) => v.id === s.activeVariantId) ?? s.variants[0];
}

export function displayedVariant(s: VariantState): Variant {
  const preview = s.previewVariantId && !s.comparing ? s.variants.find((v) => v.id === s.previewVariantId) : undefined;
  return preview ?? activeVariant(s);
}

export function variantName(variant: Variant, cubeLabel: string) {
  return variant.origin === "default" ? cubeLabel : variant.label;
}

export function sceneModelOf(variant: Variant): SceneModel {
  return variant.model;
}

export function currentSettings(): ProjectSettings {
  const { quality, qualitySteps, physicalScale, heightMeters, engine, imageEngine, textureEngine, multiviewEngine, autoTexture, gameReady, gameBudget } = useProjectStore.getState();
  return { quality, qualitySteps, physicalScale, heightMeters, engine, imageEngine, textureEngine, multiviewEngine, autoTexture, gameReady, gameBudget };
}

export function currentScene(): ProjectScene {
  const { references, prompts, variants, activeVariantId } = useProjectStore.getState();
  return { references, prompts, variants, activeVariantId };
}

export function mainReference(references: ReferenceImage[]): ReferenceImage | undefined {
  return references.find((r) => r.view === "front") ?? references[0];
}

export function activeImage(reference: ReferenceImage): ImageSource {
  return reference.usePrepared && reference.prepared ? reference.prepared : reference.original;
}
