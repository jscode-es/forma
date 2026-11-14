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
  Variant,
} from "@/lib/forma";

export type { Quality };

export const QUALITY_STEPS: Record<Quality, number> = { fast: 15, balanced: 30, high: 50 };
const MAX_VARIANTS = 24;

type ProjectState = ProjectSettings & {
  id: string | null;
  sessionId: string;
  name: string | null;
  references: ReferenceImage[];
  variants: Variant[];
  activeVariantId: string;
  previewVariantId: string | null;
  comparing: boolean;
  dirty: boolean;
  setQuality: (quality: Quality) => void;
  setPhysicalScale: (enabled: boolean) => void;
  setHeightMeters: (height: number) => void;
  setEngine: (id: string | null) => void;
  setEngineParameter: (key: string, value: ParameterValue) => void;
  setReference: (reference: ReferenceImage) => void;
  updateReference: (id: string, patch: Partial<Pick<ReferenceImage, "prepared" | "usePrepared">>) => void;
  removeReference: (id: string) => void;
  addVariant: (variant: Omit<Variant, "id" | "createdAt" | "sha256" | "triangles" | "parentId">, apply: boolean) => void;
  previewVariant: (id: string | null) => void;
  applyVariant: (id: string) => void;
  discardVariant: (id: string) => void;
  setComparing: (comparing: boolean) => void;
  recordTriangles: (id: string, triangles: number) => void;
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

function trim(variants: Variant[], keep: string[]) {
  const extra = variants.length - MAX_VARIANTS;
  if (extra <= 0) return variants;
  const removable = variants.filter((v) => !keep.includes(v.id)).slice(0, extra).map((v) => v.id);
  return variants.filter((v) => !removable.includes(v.id));
}

export const useProjectStore = create<ProjectState>()((set) => ({
  ...DEFAULT_SETTINGS,
  ...defaultVariants(),
  id: null,
  sessionId: crypto.randomUUID(),
  name: null,
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
  setEngine: (id) => set({ engine: { id, parameters: {} }, dirty: true }),
  setEngineParameter: (key, value) =>
    set((s) => ({ engine: { ...s.engine, parameters: { ...s.engine.parameters, [key]: value } }, dirty: true })),
  setReference: (reference) => set({ references: [reference], dirty: true }),
  updateReference: (id, patch) =>
    set((s) => ({ references: s.references.map((r) => (r.id === id ? { ...r, ...patch } : r)), dirty: true })),
  removeReference: (id) => set((s) => ({ references: s.references.filter((r) => r.id !== id), dirty: true })),
  addVariant: (input, apply) =>
    set((s) => {
      const variant: Variant = {
        ...input,
        id: crypto.randomUUID(),
        parentId: s.activeVariantId,
        createdAt: new Date().toISOString(),
        sha256: null,
        triangles: null,
      };
      const keep = [s.activeVariantId, variant.id];
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
      if (id === s.activeVariantId) return {};
      return {
        variants: s.variants.filter((v) => v.id !== id),
        previewVariantId: s.previewVariantId === id ? null : s.previewVariantId,
        comparing: false,
        dirty: true,
      };
    }),
  setComparing: (comparing) => set({ comparing }),
  recordTriangles: (id, triangles) =>
    set((s) => ({ variants: s.variants.map((v) => (v.id === id && v.triangles === null ? { ...v, triangles } : v)) })),
  setName: (name) => set({ name }),
  load: (project) =>
    set({
      ...project.settings,
      id: project.id,
      sessionId: crypto.randomUUID(),
      name: project.name,
      references: project.scene.references,
      variants: project.scene.variants,
      activeVariantId: project.scene.activeVariantId,
      previewVariantId: null,
      comparing: false,
      dirty: false,
    }),
  newProject: () =>
    set({
      ...DEFAULT_SETTINGS,
      ...defaultVariants(),
      id: null,
      sessionId: crypto.randomUUID(),
      name: null,
      references: [],
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
  const { quality, physicalScale, heightMeters, engine } = useProjectStore.getState();
  return { quality, physicalScale, heightMeters, engine };
}

export function currentScene(): ProjectScene {
  const { references, variants, activeVariantId } = useProjectStore.getState();
  return { references, variants, activeVariantId };
}

export function activeImage(reference: ReferenceImage): ImageSource {
  return reference.usePrepared && reference.prepared ? reference.prepared : reference.original;
}
